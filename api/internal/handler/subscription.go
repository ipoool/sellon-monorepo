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
	subs     *repository.SubscriptionRepo
	stores   *repository.StoreRepo
	products *repository.ProductRepo
	logger   *slog.Logger
}

func NewSubscriptionHandler(subs *repository.SubscriptionRepo, stores *repository.StoreRepo, products *repository.ProductRepo, logger *slog.Logger) *SubscriptionHandler {
	return &SubscriptionHandler{subs: subs, stores: stores, products: products, logger: logger}
}

// Pricing source-of-truth. Must match landing page tiers
// (web/src/components/home/pricing.tsx). Move to DB once admin tooling
// for plan management exists.
const (
	proPriceCentsPerMonth    = 99_000_00  // Rp 99.000 per month  (= "Rp 99rb")
	bisnisPriceCentsPerMonth = 299_000_00 // Rp 299.000 per month (= "Rp 299rb")
)

func priceForPlan(plan string) int64 {
	switch plan {
	case "pro":
		return proPriceCentsPerMonth
	case "bisnis":
		return bisnisPriceCentsPerMonth
	default:
		return 0
	}
}

type quotaUsage struct {
	Used  int `json:"used"`
	Limit int `json:"limit"` // -1 = unlimited
}

type subscriptionDTO struct {
	Plan               string                `json:"plan"`
	Status             string                `json:"status"`
	CurrentPeriodStart *string               `json:"current_period_start"`
	CurrentPeriodEnd   *string               `json:"current_period_end"`
	CancelledAt        *string               `json:"cancelled_at"`
	DaysRemaining      int                   `json:"days_remaining"`
	ProPriceCents      int64                 `json:"pro_price_cents"`
	BisnisPriceCents   int64                 `json:"bisnis_price_cents"`
	Quotas             map[string]quotaUsage `json:"quotas"`
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
		ProPriceCents:    proPriceCentsPerMonth,
		BisnisPriceCents: bisnisPriceCentsPerMonth,
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
				ProPriceCents:    proPriceCentsPerMonth,
				BisnisPriceCents: bisnisPriceCentsPerMonth,
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

	dto := toSubDTO(sub)
	productCount, _ := h.products.CountAll(r.Context(), store.ID)
	dto.Quotas = map[string]quotaUsage{
		"products": {Used: productCount, Limit: productLimitForPlan(sub.Plan)},
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"subscription": dto,
		"invoices":     out,
	})
}

type requestUpgradeReq struct {
	// "pro" or "bisnis". Defaults to "pro" if missing/invalid.
	Tier   string `json:"tier"`
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
	tier := strings.ToLower(strings.TrimSpace(req.Tier))
	if tier != "pro" && tier != "bisnis" {
		tier = "pro"
	}
	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	amount := priceForPlan(tier) * int64(months)
	notes := strings.TrimSpace(req.Notes)
	if notes == "" {
		notes = "Upgrade " + tier + " " + strings.ToUpper(tier[:1]) + " bulan"
	}
	if err := h.subs.CreatePendingInvoice(r.Context(), store.ID, sub.ID, amount, notes); err != nil {
		h.logger.Error("create pending invoice", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal mencatat permintaan upgrade")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{
		"ok":           true,
		"tier":         tier,
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
