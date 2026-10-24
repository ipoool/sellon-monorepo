package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

type SubscriptionHandler struct {
	subs              *repository.SubscriptionRepo
	addons            *repository.AddonRepo
	stores            *repository.StoreRepo
	products          *repository.ProductRepo
	orders            *repository.OrderRepo
	users             *repository.UserRepo
	plans             *repository.PlanRepo
	billing           *repository.BillingSettingsRepo
	midtrans          *payments.MidtransClient
	platformServerKey string
	storage           storage.Client
	mailer            *email.Mailer
	// billingNotifyEmail is BCC'd on upgrade requests; "" disables it.
	billingNotifyEmail string
	webOrigin          string
	audit              *audit.Logger
	logger             *slog.Logger
}

func NewSubscriptionHandler(
	subs *repository.SubscriptionRepo,
	addons *repository.AddonRepo,
	stores *repository.StoreRepo,
	products *repository.ProductRepo,
	orders *repository.OrderRepo,
	users *repository.UserRepo,
	plans *repository.PlanRepo,
	billing *repository.BillingSettingsRepo,
	midtrans *payments.MidtransClient,
	platformServerKey string,
	storageClient storage.Client,
	mailer *email.Mailer,
	billingNotifyEmail string,
	webOrigin string,
	audit *audit.Logger,
	logger *slog.Logger,
) *SubscriptionHandler {
	return &SubscriptionHandler{
		subs: subs, addons: addons, stores: stores, products: products, orders: orders,
		users:              users,
		plans:              plans,
		billing:            billing,
		midtrans:           midtrans,
		platformServerKey:  platformServerKey,
		storage:            storageClient,
		mailer:             mailer,
		billingNotifyEmail: strings.TrimSpace(billingNotifyEmail),
		webOrigin:          strings.TrimRight(webOrigin, "/"),
		audit:              audit,
		logger:             logger,
	}
}

// priceForPlan reads the monthly price from the plans table. The
// previous version was a hardcoded const; now admins can edit prices
// via /admin/plans without a deploy. Falls back to 0 if the plan
// can't be loaded — caller decides if that's an error.
func (h *SubscriptionHandler) priceForPlan(ctx context.Context, plan string) int64 {
	return h.plans.MonthlyPrice(ctx, plan)
}

// priceForMonths is the ONLY thing that should quote an upgrade total.
// It honours plans.yearly_price_cents (a per-month figure billed yearly)
// for 12-month purchases, so the invoice matches the discounted price the
// landing page advertises with its "−20%" badge.
func (h *SubscriptionHandler) priceForMonths(ctx context.Context, plan string, months int) int64 {
	return h.plans.PriceForMonths(ctx, plan, months)
}

// planRank orders the tiers so we can tell an upgrade from a downgrade.
var planRank = map[string]int{"free": 0, "pro": 1, "bisnis": 2}

// downgradeBlockMsg returns a non-empty error message when `tier` is LOWER
// than the plan the store is currently paying for and that paid period is
// still running.
//
// Settlement applies the invoice's tier to the whole (extended) period
// without proration, so letting a Bisnis seller with 6 months left buy
// 1 month of Pro would silently strip 6 months of paid-for features.
// Same tier = perpanjang; higher tier = switch immediately (proration is
// deliberately out of scope).
func downgradeBlockMsg(sub *repository.Subscription, tier string) string {
	if sub == nil || sub.Status == "expired" || sub.CurrentPeriodEnd == nil {
		return ""
	}
	if !sub.CurrentPeriodEnd.After(time.Now()) {
		return ""
	}
	if planRank[tier] < planRank[sub.Plan] {
		return "Paket " + sub.Plan + " kamu masih aktif — downgrade hanya bisa " +
			"dilakukan setelah masa aktif berakhir."
	}
	return ""
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
	// Gated features this store unlocks, from plan AND add-ons.
	Features []string `json:"features"`
	// Add-on codes the store currently holds, so the UI can show what is
	// already bought without a second call.
	Addons []string `json:"addons"`
	// The catalogue, so a locked screen can name the package that unlocks
	// it. Served from here because the dashboard layout already fetches
	// this endpoint, and because a feature→package map copied into the
	// frontend is a map that drifts.
	AddonCatalog []addonCatalogEntry `json:"addon_catalog"`
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
	// PaymentProofURL lets the seller see that their receipt is attached to
	// a pending request, so they know not to send it again.
	PaymentProofURL string `json:"payment_proof_url"`
	CreatedAt       string `json:"created_at"`
}

// addonCatalogEntry is the minimum a locked screen needs to offer the
// right thing: what it is called, what it costs, and what it contains.
type addonCatalogEntry struct {
	Code              string   `json:"code"`
	Name              string   `json:"name"`
	MonthlyPriceCents int64    `json:"monthly_price_cents"`
	Features          []string `json:"features"`
}

// addonCatalog reads the sellable packages. Returns nil on error rather
// than failing the response: a billing page without upsell copy is a worse
// day than a 500.
func (h *SubscriptionHandler) addonCatalog(r *http.Request) []addonCatalogEntry {
	list, err := h.addons.ListAddons(r.Context(), false)
	if err != nil {
		h.logger.Error("addon catalog", "err", err)
		return nil
	}
	out := make([]addonCatalogEntry, 0, len(list))
	for _, a := range list {
		fs := feature.AddonFeatures(feature.Addon(a.Code))
		codes := make([]string, 0, len(fs))
		for _, f := range fs {
			codes = append(codes, string(f))
		}
		out = append(out, addonCatalogEntry{
			Code: a.Code, Name: a.Name,
			MonthlyPriceCents: a.MonthlyPriceCents,
			Features:          codes,
		})
	}
	return out
}

// entFor resolves what a store may use. Falls back to the plan alone on a
// lookup error rather than failing the whole response: a seller opening
// their billing page during a DB blip should see their plan, not a 500.
func (h *SubscriptionHandler) entFor(r *http.Request, storeID uuid.UUID, plan string) feature.Entitlements {
	ent, err := h.addons.EntitlementsFor(r.Context(), storeID, plan)
	if err != nil {
		h.logger.Error("entitlements lookup", "err", err, "store_id", storeID.String())
		return feature.EntitlementsFor(plan, nil)
	}
	return ent
}

// toSubDTO builds the response DTO. Pricing is injected from the
// caller so we don't have to plumb the plans repo through a free
// function — handlers that already have ctx + repo can do the lookup.
func toSubDTO(s *repository.Subscription, proCents, bisnisCents int64, ent feature.Entitlements) subscriptionDTO {
	codes := make([]string, 0, len(ent.Addons))
	for _, a := range feature.AddonOrder {
		if ent.Addons[a] {
			codes = append(codes, string(a))
		}
	}
	out := subscriptionDTO{
		Plan: s.Plan, Status: s.Status,
		ProPriceCents:    proCents,
		BisnisPriceCents: bisnisCents,
		Features:         ent.Granted(),
		Addons:           codes,
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
		Provider:        inv.Provider,
		PeriodStart:     formatPtr(inv.PeriodStart),
		PeriodEnd:       formatPtr(inv.PeriodEnd),
		PaidAt:          formatPtr(inv.PaidAt),
		Notes:           inv.Notes,
		PaymentProofURL: inv.PaymentProofURL,
		CreatedAt:       inv.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
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
	// Where to send the transfer. Manual transfer is the only way to pay,
	// so this travels with the subscription itself rather than sitting in
	// the web bundle as a constant. A read failure degrades to empty
	// fields — the dialog then points at WhatsApp support instead of
	// showing a wrong account number.
	billing, berr := h.billing.Get(r.Context())
	if berr != nil {
		h.logger.Error("subscription: billing settings", "err", berr)
	}
	billingOut := map[string]any{
		"bank_name":        billing.BankName,
		"account_number":   billing.AccountNumber,
		"account_name":     billing.AccountName,
		"support_whatsapp": billing.SupportWhatsApp,
		"note":             billing.Note,
	}

	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{
			"subscription": subscriptionDTO{
				Plan: "free", Status: "active",
				ProPriceCents:    proCents,
				BisnisPriceCents: bisnisCents,
				Features:         feature.EntitlementsFor("free", nil).Granted(),
				Addons:           []string{},
			},
			"invoices": []invoiceDTO{},
			"billing":  billingOut,
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

	dto := toSubDTO(sub, proCents, bisnisCents, h.entFor(r, store.ID, sub.Plan))
	dto.AddonCatalog = h.addonCatalog(r)
	productCount, _ := h.products.CountAll(r.Context(), store.ID)
	orderCount, _ := h.orders.CountThisMonth(r.Context(), store.ID)
	dto.Quotas = map[string]quotaUsage{
		"products": {Used: productCount, Limit: productLimitForSub(sub)},
		"orders":   {Used: orderCount, Limit: orderLimitForSub(sub)},
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"subscription": dto,
		"invoices":     out,
		"billing":      billingOut,
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
	// Two body shapes. A plain JSON post is the original contract and stays
	// working; multipart carries the same fields plus the transfer receipt,
	// so attaching a proof is the SAME action as recording the request
	// rather than a second call that can fail on its own and leave an
	// invoice nobody can verify.
	req, proof, err := parseUpgradeRequest(w, r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
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
	if msg := downgradeBlockMsg(sub, tier); msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}

	// Dedupe: if ops hasn't verified the previous pending request yet,
	// don't write another row. Returning the existing one keeps the
	// endpoint idempotent — clicking "Saya sudah transfer" twice is
	// safe. `already_pending: true` lets the frontend swap its toast
	// from "tercatat" to "lagi diverifikasi".
	if existing, err := h.subs.FindOpenManualInvoice(r.Context(), sub.ID); err == nil && existing != nil {
		// A receipt sent with the retry still belongs on the open invoice —
		// dropping it because a row already exists is how a seller ends up
		// unable to attach proof at all after their first click.
		proofURL := existing.PaymentProofURL
		if proof != nil {
			if url, upErr := h.storeUpgradeProof(r.Context(), store.ID, existing.ID, proof); upErr != nil {
				h.logger.Error("upgrade proof upload (pending)", "err", upErr, "invoice", existing.ID)
			} else {
				proofURL = url
			}
		}
		response.JSON(w, http.StatusOK, map[string]any{
			"ok":                true,
			"already_pending":   true,
			"tier":              existing.Plan,
			"amount_cents":      existing.AmountCents,
			"months":            existing.Months,
			"payment_proof_url": proofURL,
			"created_at":        existing.CreatedAt.Format(time.RFC3339),
		})
		return
	}

	amount := h.priceForMonths(r.Context(), tier, months)
	lines, amount, qerr := h.quoteFor(r, store.ID, tier, months, amount)
	if qerr != nil {
		h.logger.Error("upgrade request: quote", "err", qerr)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
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
	invoice, err := h.subs.CreatePendingInvoiceWithLines(
		r.Context(), store.ID, sub.ID, amount, tier, months, notes, lines)
	if err != nil {
		h.logger.Error("create pending invoice", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal mencatat permintaan upgrade")
		return
	}

	// The seller has already moved the money by the time they click, so an
	// upload failure must not discard the request. Record it, report the
	// proof as missing, and let them retry — the retry lands on the
	// already-pending branch above and attaches to this same invoice.
	proofURL := ""
	if proof != nil {
		if url, upErr := h.storeUpgradeProof(r.Context(), store.ID, invoice.ID, proof); upErr != nil {
			h.logger.Error("upgrade proof upload", "err", upErr, "invoice", invoice.ID)
		} else {
			proofURL = url
		}
	}
	h.sendUpgradeRequestEmail(r.Context(), store, invoice, planLabel, months, amount, proofURL)
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
		"ok":                true,
		"already_pending":   false,
		"tier":              tier,
		"amount_cents":      amount,
		"months":            months,
		"invoice_id":        invoice.ID.String(),
		"payment_proof_url": proofURL,
		// The seller transferred before clicking, so a failed upload is
		// worth telling them about rather than silently succeeding.
		"proof_uploaded": proof == nil || proofURL != "",
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
			h.priceForPlan(r.Context(), "bisnis"),
			h.entFor(r, store.ID, sub.Plan)),
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
			h.priceForPlan(r.Context(), "bisnis"),
			h.entFor(r, store.ID, sub.Plan)),
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
	amountCents := h.priceForMonths(r.Context(), tier, months)

	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("checkout: get sub", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if msg := downgradeBlockMsg(sub, tier); msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
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

	lines, amountCents, qerr := h.quoteFor(r, store.ID, tier, months, amountCents)
	if qerr != nil {
		h.logger.Error("checkout: quote", "err", qerr)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	inv, err := h.subs.CreateCheckoutInvoiceWithLines(r.Context(), store.ID, sub.ID,
		amountCents, "midtrans", orderID, tier, months, notes, lines,
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
		ServerKey:     h.platformServerKey,
		// One Snap item per invoice line, so the Midtrans receipt reads
		// the same as the invoice. Their gross_amount must equal the sum
		// of item prices or the charge is rejected outright.
		Items: snapItemsFor(lines, months),
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

// uploadedProof is a sniffed, size-checked receipt ready to be stored.
type uploadedProof struct {
	body        []byte
	contentType string
	ext         string
}

// maxProofBytes caps the receipt at 10 MB — comfortably above a phone
// screenshot and matching the buyer-side payment-proof endpoint.
const maxProofBytes = 10 * 1024 * 1024

// parseUpgradeRequest reads the upgrade fields from either a JSON body (the
// original contract) or a multipart form carrying the transfer receipt.
// Returns a nil proof when no file was attached, which is still a valid
// request: sending the receipt over WhatsApp remains supported.
func parseUpgradeRequest(w http.ResponseWriter, r *http.Request) (requestUpgradeReq, *uploadedProof, error) {
	var req requestUpgradeReq

	if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return req, nil, errors.New("invalid body")
		}
		return req, nil, nil
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxProofBytes)
	if err := r.ParseMultipartForm(maxProofBytes); err != nil {
		return req, nil, errors.New("file terlalu besar (maks 10 MB)")
	}
	req.Tier = r.FormValue("tier")
	req.Plan = r.FormValue("plan")
	req.Notes = r.FormValue("notes")
	req.Months, _ = strconv.Atoi(r.FormValue("months"))

	file, _, err := r.FormFile("payment_proof")
	if err != nil {
		// No file on a multipart post is fine — the client may simply have
		// used the form encoding without picking a receipt.
		return req, nil, nil
	}
	defer file.Close()

	body, err := io.ReadAll(file)
	if err != nil {
		return req, nil, errors.New("gagal baca file bukti transfer")
	}
	if len(body) == 0 {
		return req, nil, nil
	}
	// Sniff the bytes rather than trust the multipart part's Content-Type,
	// which the client sets freely.
	contentType := http.DetectContentType(body)
	ext := ""
	switch contentType {
	case "image/jpeg":
		ext = "jpg"
	case "image/png":
		ext = "png"
	case "image/webp":
		ext = "webp"
	default:
		return req, nil, errors.New("bukti transfer harus JPG / PNG / WebP")
	}
	return req, &uploadedProof{body: body, contentType: contentType, ext: ext}, nil
}

// storeUpgradeProof puts the receipt in object storage and attaches it to the
// invoice. The key carries the store prefix that the cross-tenant delete
// guard checks, and the invoice id so one store's receipts stay separable.
func (h *SubscriptionHandler) storeUpgradeProof(
	ctx context.Context, storeID, invoiceID uuid.UUID, proof *uploadedProof,
) (string, error) {
	if h.storage == nil || !h.storage.IsConfigured() {
		return "", errors.New("upload belum dikonfigurasi di server")
	}
	key, err := storage.RandomKey(
		storeID.String()+"/subscription_proofs/"+invoiceID.String(), proof.ext)
	if err != nil {
		return "", err
	}
	res, err := h.storage.Upload(ctx, key, proof.contentType, proof.body)
	if err != nil {
		return "", err
	}
	if err := h.subs.SetInvoicePaymentProof(ctx, storeID, invoiceID, res.PublicURL); err != nil {
		return "", err
	}
	return res.PublicURL, nil
}

// sendUpgradeRequestEmail confirms the request to the seller and BCCs the
// billing inbox so a manual activation does not depend on anyone polling
// /platform/subscriptions. Fire-and-forget: mail is never allowed to fail a
// request whose money has already moved.
func (h *SubscriptionHandler) sendUpgradeRequestEmail(
	ctx context.Context,
	store *repository.Store,
	invoice *repository.SubscriptionInvoice,
	planLabel string,
	months int,
	amountCents int64,
	proofURL string,
) {
	if h.mailer == nil || !h.mailer.Configured() {
		return
	}
	owner, err := h.users.FindByID(ctx, store.OwnerID)
	if err != nil || owner == nil || owner.Email == "" {
		// Without an owner address there is no primary recipient, and a
		// BCC-only message would arrive with an empty To header.
		h.logger.Warn("upgrade request email: no owner address", "store", store.ID)
		return
	}
	subject, text, htmlBody := email.RenderSubscriptionUpgradeRequest(email.UpgradeRequestData{
		StoreName:    store.Name,
		StoreSlug:    store.Slug,
		OwnerName:    owner.Name,
		OwnerEmail:   owner.Email,
		PlanLabel:    planLabel,
		Months:       months,
		AmountCents:  amountCents,
		InvoiceID:    invoice.ID.String(),
		ProofURL:     proofURL,
		AdminURL:     h.webOrigin + "/platform/subscriptions",
		DashboardURL: h.webOrigin + "/settings/subscription",
	})
	var bcc []string
	if h.billingNotifyEmail != "" {
		bcc = []string{h.billingNotifyEmail}
	}
	h.mailer.Send(email.Message{
		To:      owner.Email,
		BCC:     bcc,
		Subject: subject,
		Text:    text,
		HTML:    htmlBody,
	})
}

// quoteFor builds an invoice breakdown: the plan, plus every add-on the
// store holds. Returns the lines and the new total.
//
// Shared by BOTH payment paths on purpose. It used to live inline in the
// Snap checkout, which meant a seller paying by manual transfer was billed
// for the plan alone and kept their add-ons for nothing — the kind of hole
// that is only ever found by someone's accountant.
//
// Add-ons are billed at RENEWAL, never prorated. This is where one
// switched on mid-period is finally charged, as a whole month, so every
// figure on the invoice is one a seller can check on a calculator.
func (h *SubscriptionHandler) quoteFor(
	r *http.Request,
	storeID uuid.UUID,
	tier string,
	months int,
	planAmount int64,
) ([]repository.InvoiceLine, int64, error) {
	planLabel := "Pro"
	if tier == "bisnis" {
		planLabel = "Bisnis"
	}
	lines := []repository.InvoiceLine{{
		Kind: "plan", Code: tier,
		Description:    "SellOn " + planLabel,
		Months:         months,
		UnitPriceCents: planAmount / int64(months),
		AmountCents:    planAmount,
	}}
	total := planAmount

	// Bisnis already bundles everything, so charging add-ons on top would
	// bill the same features twice.
	if tier == "bisnis" {
		return lines, total, nil
	}

	held, err := h.addons.ListForStore(r.Context(), storeID)
	if err != nil {
		return nil, 0, err
	}
	for _, row := range held {
		a, ferr := h.addons.FindAddon(r.Context(), row.AddonCode)
		if ferr != nil {
			// A retired add-on the store still holds. Skip it rather than
			// charge for something no longer sold.
			h.logger.Warn("quote: skipping unknown addon",
				"code", row.AddonCode, "err", ferr)
			continue
		}
		amt := a.PriceForMonths(months)
		lines = append(lines, repository.InvoiceLine{
			Kind: "addon", Code: a.Code,
			Description:    a.Name,
			Months:         months,
			UnitPriceCents: amt / int64(months),
			AmountCents:    amt,
		})
		total += amt
	}
	return lines, total, nil
}

// snapItemsFor mirrors the invoice breakdown into Midtrans line items.
//
// Midtrans rejects a transaction whose gross_amount does not equal the sum
// of its items, which makes this the second place the lines have to add up
// — and a useful backstop on the first.
func snapItemsFor(lines []repository.InvoiceLine, months int) []payments.SnapItem {
	out := make([]payments.SnapItem, 0, len(lines))
	for _, l := range lines {
		out = append(out, payments.SnapItem{
			ID:       "sellon-" + l.Kind + "-" + l.Code,
			Name:     l.Description + " — " + intToStr(months) + " bulan",
			Price:    l.AmountCents,
			Quantity: 1,
		})
	}
	return out
}

// === Quote ===

// GET /api/v1/subscription/quote?tier=pro&months=1 — the invoice this
// upgrade WOULD produce, without producing it.
//
// Manual bank transfer is the only way to pay for a subscription right
// now, which means the seller reads a number off this screen and types it
// into their banking app by hand. The frontend used to compute that number
// itself from the plan price, so a store holding add-ons was told to send
// Rp 99.000 while RequestUpgrade wrote an invoice for Rp 198.000 — the
// transfer then matches nothing, and someone has to sort it out over
// WhatsApp.
//
// So the quote comes from quoteFor, the same function both payment paths
// use to build the real lines. The two cannot disagree because there is
// only one of them.
func (h *SubscriptionHandler) Quote(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	months, _ := strconv.Atoi(r.URL.Query().Get("months"))
	tier, months, errMsg := resolveUpgradeRequest(
		r.URL.Query().Get("tier"), r.URL.Query().Get("plan"), months)
	if errMsg != "" {
		response.Error(w, http.StatusBadRequest, errMsg)
		return
	}

	lines, total, qerr := h.quoteFor(
		r, store.ID, tier, months, h.priceForMonths(r.Context(), tier, months))
	if qerr != nil {
		h.logger.Error("quote", "err", qerr)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]map[string]any, 0, len(lines))
	for _, l := range lines {
		out = append(out, map[string]any{
			"kind":             l.Kind,
			"code":             l.Code,
			"description":      l.Description,
			"months":           l.Months,
			"unit_price_cents": l.UnitPriceCents,
			"amount_cents":     l.AmountCents,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"tier":        tier,
		"months":      months,
		"lines":       out,
		"total_cents": total,
	})
}
