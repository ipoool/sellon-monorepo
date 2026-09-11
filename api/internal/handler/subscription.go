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
	stores            *repository.StoreRepo
	products          *repository.ProductRepo
	orders            *repository.OrderRepo
	users             *repository.UserRepo
	plans             *repository.PlanRepo
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
	stores *repository.StoreRepo,
	products *repository.ProductRepo,
	orders *repository.OrderRepo,
	users *repository.UserRepo,
	plans *repository.PlanRepo,
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
		subs: subs, stores: stores, products: products, orders: orders,
		users:              users,
		plans:              plans,
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
	Features           []string              `json:"features"` // gated features this plan unlocks
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

// toSubDTO builds the response DTO. Pricing is injected from the
// caller so we don't have to plumb the plans repo through a free
// function — handlers that already have ctx + repo can do the lookup.
func toSubDTO(s *repository.Subscription, proCents, bisnisCents int64) subscriptionDTO {
	out := subscriptionDTO{
		Plan: s.Plan, Status: s.Status,
		ProPriceCents:    proCents,
		BisnisPriceCents: bisnisCents,
		Features:         feature.ForPlan(s.Plan),
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

	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{
			"subscription": subscriptionDTO{
				Plan: "free", Status: "active",
				ProPriceCents:    proCents,
				BisnisPriceCents: bisnisCents,
				Features:         feature.ForPlan("free"),
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
	invoice, err := h.subs.CreatePendingInvoice(r.Context(), store.ID, sub.ID, amount, tier, months, notes)
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
