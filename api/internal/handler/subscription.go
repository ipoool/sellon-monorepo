package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type SubscriptionHandler struct {
	subs              *repository.SubscriptionRepo
	stores            *repository.StoreRepo
	products          *repository.ProductRepo
	orders            *repository.OrderRepo
	users             *repository.UserRepo
	plans             *repository.PlanRepo
	midtrans          *payments.MidtransClient
	platformServerKey string
	platformSandbox   bool
	audit             *audit.Logger
	logger            *slog.Logger
}

func NewSubscriptionHandler(
	subs *repository.SubscriptionRepo,
	stores *repository.StoreRepo,
	products *repository.ProductRepo,
	orders *repository.OrderRepo,
	users *repository.UserRepo,
	plans *repository.PlanRepo,
	midtrans *payments.MidtransClient,
	platformServerKey string,
	platformSandbox bool,
	audit *audit.Logger,
	logger *slog.Logger,
) *SubscriptionHandler {
	return &SubscriptionHandler{
		subs: subs, stores: stores, products: products, orders: orders,
		users:             users,
		plans:             plans,
		midtrans:          midtrans,
		platformServerKey: platformServerKey,
		platformSandbox:   platformSandbox,
		audit:             audit,
		logger:            logger,
	}
}

// priceForPlan reads the monthly price from the plans table. The
// previous version was a hardcoded const; now admins can edit prices
// via /admin/plans without a deploy. Falls back to 0 if the plan
// can't be loaded — caller decides if that's an error.
func (h *SubscriptionHandler) priceForPlan(ctx context.Context, plan string) int64 {
	return h.plans.MonthlyPrice(ctx, plan)
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
	Provider    string  `json:"provider"` // "manual_transfer" | "midtrans" | ""
	PeriodStart *string `json:"period_start"`
	PeriodEnd   *string `json:"period_end"`
	PaidAt      *string `json:"paid_at"`
	Notes       string  `json:"notes"`
	CreatedAt   string  `json:"created_at"`
}

// toSubDTO builds the response DTO. Pricing is injected from the
// caller so we don't have to plumb the plans repo through a free
// function — handlers that already have ctx + repo can do the lookup.
func toSubDTO(s *repository.Subscription, proCents, bisnisCents int64) subscriptionDTO {
	out := subscriptionDTO{
		Plan: s.Plan, Status: s.Status,
		ProPriceCents:    proCents,
		BisnisPriceCents: bisnisCents,
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
		Provider:    inv.Provider,
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
	proCents := h.priceForPlan(r.Context(), "pro")
	bisnisCents := h.priceForPlan(r.Context(), "bisnis")

	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{
			"subscription": subscriptionDTO{
				Plan: "free", Status: "active",
				ProPriceCents:    proCents,
				BisnisPriceCents: bisnisCents,
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

	dto := toSubDTO(sub, proCents, bisnisCents)
	productCount, _ := h.products.CountAll(r.Context(), store.ID)
	orderCount, _ := h.orders.CountThisMonth(r.Context(), store.ID)
	dto.Quotas = map[string]quotaUsage{
		"products": {Used: productCount, Limit: productLimitForSub(sub)},
		"orders":   {Used: orderCount, Limit: orderLimitForSub(sub)},
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"subscription": dto,
		"invoices":     out,
	})
}

type requestUpgradeReq struct {
	// "pro" or "bisnis". Field is `tier`; we also accept `plan` as an
	// alias because clients in the wild use both keys. Empty / unknown
	// values now reject with 400 instead of silently downgrading to
	// "pro" (BUG-023, BUG-024).
	Tier   string `json:"tier"`
	Plan   string `json:"plan"`
	Months int    `json:"months"`
	Notes  string `json:"notes"`
}

// validUpgradeMonths is the closed set of billing periods we offer.
// Anything else rejects rather than silently coercing (BUG-025).
var validUpgradeMonths = map[int]bool{1: true, 3: true, 6: true, 12: true}

// resolveUpgradeRequest parses + validates tier + months. Returns a
// tidy error message for the caller to surface as 400.
func resolveUpgradeRequest(rawTier, rawPlan string, months int) (tier string, _ int, errMsg string) {
	raw := strings.ToLower(strings.TrimSpace(rawTier))
	if raw == "" {
		raw = strings.ToLower(strings.TrimSpace(rawPlan))
	}
	if raw != "pro" && raw != "bisnis" {
		return "", 0, "plan tidak dikenal — pilih pro atau bisnis"
	}
	if !validUpgradeMonths[months] {
		return "", 0, "durasi bulan tidak valid — pilih 1, 3, 6, atau 12"
	}
	return raw, months, ""
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
	tier, months, errMsg := resolveUpgradeRequest(req.Tier, req.Plan, req.Months)
	if errMsg != "" {
		response.Error(w, http.StatusBadRequest, errMsg)
		return
	}
	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Dedupe: if ops hasn't verified the previous pending request yet,
	// don't write another row. Returning the existing one keeps the
	// endpoint idempotent — clicking "Saya sudah transfer" twice is
	// safe. `already_pending: true` lets the frontend swap its toast
	// from "tercatat" to "lagi diverifikasi".
	if existing, err := h.subs.FindOpenManualInvoice(r.Context(), sub.ID); err == nil && existing != nil {
		response.JSON(w, http.StatusOK, map[string]any{
			"ok":              true,
			"already_pending": true,
			"tier":            existing.Plan,
			"amount_cents":    existing.AmountCents,
			"months":          existing.Months,
			"created_at":      existing.CreatedAt.Format(time.RFC3339),
		})
		return
	}

	amount := h.priceForPlan(r.Context(), tier) * int64(months)
	planLabel := "Pro"
	if tier == "bisnis" {
		planLabel = "Bisnis"
	}
	notes := strings.TrimSpace(req.Notes)
	if notes == "" {
		// BUG-027: previous version interpolated the first letter of the
		// tier ("P") in the slot meant for the months count.
		notes = "Upgrade " + planLabel + " · " + intToStr(months) + " bulan"
	}
	if err := h.subs.CreatePendingInvoice(r.Context(), store.ID, sub.ID, amount, tier, months, notes); err != nil {
		h.logger.Error("create pending invoice", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal mencatat permintaan upgrade")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "subscription.upgrade_requested",
		EntityType: "subscription",
		EntityID:   sub.ID.String(),
		Summary:    "Permintaan upgrade " + tier + " " + intToStr(months) + " bulan (transfer manual)",
		Metadata: map[string]any{
			"tier":         tier,
			"months":       months,
			"amount_cents": amount,
			"channel":      "manual_transfer",
		},
	})
	response.JSON(w, http.StatusCreated, map[string]any{
		"ok":              true,
		"already_pending": false,
		"tier":            tier,
		"amount_cents":    amount,
		"months":          months,
	})
}

// POST /api/v1/subscription/cancel — cancel renewal at period end.
func (h *SubscriptionHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	// Reject cancel when there's no paid period to wind down. Free tier
	// has no renewal, and a cancelled-but-still-free row leaves the user
	// stuck (Resume bails because period_end is in the past). BUG-026.
	current, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("subscription cancel: load", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if current.Plan == "free" {
		response.Error(w, http.StatusBadRequest,
			"tidak ada langganan berbayar untuk dibatalkan")
		return
	}
	sub, err := h.subs.Cancel(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("subscription cancel", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal cancel")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "subscription.cancelled",
		EntityType: "subscription",
		EntityID:   sub.ID.String(),
		Summary:    "Batalkan langganan " + sub.Plan,
		Metadata:   map[string]any{"plan": sub.Plan},
	})
	response.JSON(w, http.StatusOK, map[string]any{
		"subscription": toSubDTO(sub,
			h.priceForPlan(r.Context(), "pro"),
			h.priceForPlan(r.Context(), "bisnis")),
	})
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
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "subscription.resumed",
		EntityType: "subscription",
		EntityID:   sub.ID.String(),
		Summary:    "Aktifkan kembali langganan " + sub.Plan,
		Metadata:   map[string]any{"plan": sub.Plan},
	})
	response.JSON(w, http.StatusOK, map[string]any{
		"subscription": toSubDTO(sub,
			h.priceForPlan(r.Context(), "pro"),
			h.priceForPlan(r.Context(), "bisnis")),
	})
}

// === Midtrans Snap checkout ===

type checkoutReq struct {
	Tier   string `json:"tier"`
	Plan   string `json:"plan"` // alias for `tier`
	Months int    `json:"months"`
}

// POST /api/v1/subscription/checkout — kicks off a platform-billing
// Snap session. Creates a pending invoice tagged with a fresh order_id,
// then returns Snap's redirect_url + token. Settlement happens through
// /webhooks/platform/midtrans, which calls SettleInvoice.
func (h *SubscriptionHandler) Checkout(w http.ResponseWriter, r *http.Request) {
	if h.platformServerKey == "" {
		response.Error(w, http.StatusServiceUnavailable,
			"pembayaran online belum aktif — silakan transfer manual")
		return
	}
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}

	var req checkoutReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	tier, months, errMsg := resolveUpgradeRequest(req.Tier, req.Plan, req.Months)
	if errMsg != "" {
		response.Error(w, http.StatusBadRequest, errMsg)
		return
	}
	amountCents := h.priceForPlan(r.Context(), tier) * int64(months)

	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("checkout: get sub", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Order ID format: SUB-{shortStoreID}-{compactTimestamp}. Stays well
	// under Midtrans's 50-char limit and is uniquely traceable back to the
	// invoice via the provider_order_id index.
	orderID := "SUB-" + store.ID.String()[:8] + "-" +
		strings.ReplaceAll(time.Now().UTC().Format("060102150405.000"), ".", "")

	planLabel := "Pro"
	if tier == "bisnis" {
		planLabel = "Bisnis"
	}
	notes := "Upgrade " + planLabel + " · " + intToStr(months) + " bulan · " + orderID

	inv, err := h.subs.CreateCheckoutInvoice(r.Context(), store.ID, sub.ID,
		amountCents, "midtrans", orderID, tier, months, notes,
	)
	if err != nil {
		h.logger.Error("checkout: create invoice", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Best-effort buyer profile for Midtrans (used for receipts only).
	user, _ := h.users.FindByID(r.Context(), uid)
	customerName := store.Name
	customerEmail := ""
	if user != nil {
		if user.Name != "" {
			customerName = user.Name
		}
		customerEmail = user.Email
	}

	snapResp, err := h.midtrans.CreateSnapTransaction(payments.SnapTransactionInput{
		OrderID:       orderID,
		GrossAmount:   amountCents,
		CustomerName:  customerName,
		CustomerEmail: customerEmail,
		CustomerPhone: store.WhatsAppNumber,
		IsSandbox:     h.platformSandbox,
		ServerKey:     h.platformServerKey,
		Items: []payments.SnapItem{
			{
				ID:       "sellon-" + tier,
				Name:     "SellOn " + planLabel + " — " + intToStr(months) + " bulan",
				Price:    amountCents,
				Quantity: 1,
			},
		},
	})
	if err != nil {
		h.logger.Error("midtrans snap subs", "err", err, "order_id", orderID)
		_ = h.subs.MarkInvoiceFailed(r.Context(), inv.ID)
		response.Error(w, http.StatusBadGateway,
			"gagal membuat sesi pembayaran — coba lagi atau pakai transfer manual")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"invoice_id":   inv.ID.String(),
		"order_id":     orderID,
		"redirect_url": snapResp.RedirectURL,
		"snap_token":   snapResp.Token,
		"amount_cents": amountCents,
		"tier":         tier,
		"months":       months,
	})
}

func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
