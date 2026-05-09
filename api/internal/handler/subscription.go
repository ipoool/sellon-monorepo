package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type SubscriptionHandler struct {
	subs   *repository.SubscriptionRepo
	stores *repository.StoreRepo
	logger *slog.Logger
}

func NewSubscriptionHandler(subs *repository.SubscriptionRepo, stores *repository.StoreRepo, logger *slog.Logger) *SubscriptionHandler {
	return &SubscriptionHandler{subs: subs, stores: stores, logger: logger}
}

// Pricing source-of-truth lives here for now. When automated billing
// arrives, move this into the DB so plan changes don't require a deploy.
// Must match the Pro tier on the landing page (web/src/components/home/pricing.tsx).
const proPriceCentsPerMonth = 99_000_00 // Rp 99.000 per month (= "Rp 99rb")

type subscriptionDTO struct {
	Plan               string  `json:"plan"`
	Status             string  `json:"status"`
	CurrentPeriodStart *string `json:"current_period_start"`
	CurrentPeriodEnd   *string `json:"current_period_end"`
	CancelledAt        *string `json:"cancelled_at"`
	DaysRemaining      int     `json:"days_remaining"`
	ProPriceCents      int64   `json:"pro_price_cents"`
}

type invoiceDTO struct {
	ID          string  `json:"id"`
	AmountCents int64   `json:"amount_cents"`
	Status      string  `json:"status"`
	PeriodStart *string `json:"period_start"`
	PeriodEnd   *string `json:"period_end"`
	PaidAt      *string `json:"paid_at"`
	Notes       string  `json:"notes"`
	CreatedAt   string  `json:"created_at"`
}

func toSubDTO(s *repository.Subscription) subscriptionDTO {
	out := subscriptionDTO{
		Plan: s.Plan, Status: s.Status,
		ProPriceCents: proPriceCentsPerMonth,
	}
	formatPtr := func(t *time.Time) *string {
		if t == nil {
			return nil
		}
		v := t.Format("2006-01-02T15:04:05Z07:00")
		return &v
	}
	out.CurrentPeriodStart = formatPtr(s.CurrentPeriodStart)
	out.CurrentPeriodEnd = formatPtr(s.CurrentPeriodEnd)
	out.CancelledAt = formatPtr(s.CancelledAt)
	if s.CurrentPeriodEnd != nil {
		d := time.Until(*s.CurrentPeriodEnd).Hours() / 24
		if d < 0 {
			d = 0
		}
		out.DaysRemaining = int(d + 0.999) // ceil
	}
	return out
}

func toInvoiceDTO(inv repository.SubscriptionInvoice) invoiceDTO {
	formatPtr := func(t *time.Time) *string {
		if t == nil {
			return nil
		}
		v := t.Format("2006-01-02T15:04:05Z07:00")
		return &v
	}
	return invoiceDTO{
		ID: inv.ID.String(), AmountCents: inv.AmountCents, Status: inv.Status,
		PeriodStart: formatPtr(inv.PeriodStart),
		PeriodEnd:   formatPtr(inv.PeriodEnd),
		PaidAt:      formatPtr(inv.PaidAt),
		Notes:       inv.Notes,
		CreatedAt:   inv.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func (h *SubscriptionHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// GET /api/v1/subscription
func (h *SubscriptionHandler) Get(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{
			"subscription": subscriptionDTO{
				Plan: "free", Status: "active",
				ProPriceCents: proPriceCentsPerMonth,
			},
			"invoices": []invoiceDTO{},
		})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("subscription get-or-create", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	invoices, _ := h.subs.ListInvoices(r.Context(), store.ID)
	out := make([]invoiceDTO, 0, len(invoices))
	for _, inv := range invoices {
		out = append(out, toInvoiceDTO(inv))
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"subscription": toSubDTO(sub),
		"invoices":     out,
	})
}

type requestUpgradeReq struct {
	Months int    `json:"months"`
	Notes  string `json:"notes"`
}

// POST /api/v1/subscription/request-upgrade
//
// MVP flow: seller transfers manually (WhatsApp / bank transfer to ops),
// then clicks "Saya sudah transfer" — we record a pending invoice. Ops
// verifies the transfer and calls /confirm-upgrade with the months.
func (h *SubscriptionHandler) RequestUpgrade(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req requestUpgradeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	months := req.Months
	if months <= 0 || months > 12 {
		months = 1
	}
	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	amount := proPriceCentsPerMonth * int64(months)
	if err := h.subs.CreatePendingInvoice(r.Context(), store.ID, sub.ID, amount, strings.TrimSpace(req.Notes)); err != nil {
		h.logger.Error("create pending invoice", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal mencatat permintaan upgrade")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{
		"ok":           true,
		"amount_cents": amount,
		"months":       months,
	})
}

// POST /api/v1/subscription/cancel — cancel renewal at period end.
func (h *SubscriptionHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	sub, err := h.subs.Cancel(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("subscription cancel", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal cancel")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"subscription": toSubDTO(sub)})
}

// POST /api/v1/subscription/resume — undo cancel while still in period.
func (h *SubscriptionHandler) Resume(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	sub, err := h.subs.Resume(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("subscription resume", "err", err)
		response.Error(w, http.StatusBadRequest, "tidak bisa resume — periode mungkin sudah berakhir")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"subscription": toSubDTO(sub)})
}
