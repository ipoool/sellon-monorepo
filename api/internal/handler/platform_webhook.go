package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// PlatformWebhookHandler receives Midtrans Snap notifications for the
// SaaS-side billing flow (subscription upgrades). This is separate from
// the per-store webhook used by sellers' own Midtrans accounts at
// /api/v1/webhooks/midtrans/{store_id}.
type PlatformWebhookHandler struct {
	subs      *repository.SubscriptionRepo
	booth     *repository.PhotoBoothSessionRepo
	serverKey string
	audit     *audit.Logger
	logger    *slog.Logger
}

func NewPlatformWebhookHandler(subs *repository.SubscriptionRepo, booth *repository.PhotoBoothSessionRepo, serverKey string, audit *audit.Logger, logger *slog.Logger) *PlatformWebhookHandler {
	return &PlatformWebhookHandler{subs: subs, booth: booth, serverKey: serverKey, audit: audit, logger: logger}
}

type platformNotification struct {
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
	// Midtrans's own id for the transaction. Recorded on a PhotoBoost
	// session so a support question can be traced into their dashboard.
	TransactionID string `json:"transaction_id"`
}

// POST /api/v1/webhooks/platform/midtrans — public endpoint Midtrans hits.
//
// We always return 200 once the signature is valid; that prevents Midtrans
// from retrying for transient app errors that aren't actually a delivery
// failure. Real failures (signature, missing invoice) return 4xx so we
// see them in dashboards.
func (h *PlatformWebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h.serverKey == "" {
		response.Error(w, http.StatusServiceUnavailable, "platform billing not configured")
		return
	}

	var n platformNotification
	if err := json.NewDecoder(r.Body).Decode(&n); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if n.OrderID == "" || n.SignatureKey == "" {
		response.Error(w, http.StatusBadRequest, "missing fields")
		return
	}

	if !payments.VerifySignature(n.OrderID, n.StatusCode, n.GrossAmount, h.serverKey, n.SignatureKey) {
		h.logger.Warn("platform webhook: bad signature", "order_id", n.OrderID)
		response.Error(w, http.StatusUnauthorized, "bad signature")
		return
	}

	// One Midtrans account has one notification URL, so everything the
	// platform charges arrives here. Route on the order_id prefix: SUB- is
	// SaaS billing, PB- is a PhotoBoost session, anything else is not ours.
	switch {
	case strings.HasPrefix(n.OrderID, "SUB-"):
		h.handleSubscription(w, r, n)
	case strings.HasPrefix(n.OrderID, "PB-"):
		h.handlePhotoBooth(w, r, n)
	default:
		response.JSON(w, http.StatusOK, map[string]any{"ignored": true})
	}
}

// handleSubscription settles a SaaS billing invoice.
func (h *PlatformWebhookHandler) handleSubscription(w http.ResponseWriter, r *http.Request, n platformNotification) {
	inv, err := h.subs.FindInvoiceByProviderOrderID(r.Context(), n.OrderID)
	if err != nil {
		h.logger.Warn("platform webhook: invoice not found", "order_id", n.OrderID)
		response.Error(w, http.StatusNotFound, "invoice not found")
		return
	}

	// Amount integrity, same rule the per-store webhook applies: what
	// Midtrans says was charged must match what we billed. The signature
	// already covers gross_amount, so this is not about forgery — it catches
	// a transaction whose amount drifted from the invoice (a plan price
	// edited between checkout and payment, a transaction re-created by hand
	// in the Midtrans dashboard under the same order id). Granting a full
	// period for a smaller payment is not something to discover from a
	// support ticket. Tolerance is one rupiah: the gateway settles in whole
	// rupiah.
	const grossToleranceCents = 100
	amountMismatch := false
	if cents, ok := rupiahToCents(n.GrossAmount); ok && absInt64(cents-inv.AmountCents) >= grossToleranceCents {
		amountMismatch = true
		h.logger.Error("platform webhook: gross_amount mismatch — not settling",
			"order_id", n.OrderID, "invoice_id", inv.ID,
			"midtrans_cents", cents, "invoice_cents", inv.AmountCents)
	}

	mapped := payments.MapTransactionStatus(n.TransactionStatus, n.FraudStatus)
	if mapped == "paid" && amountMismatch {
		// Ack so Midtrans stops retrying, but grant nothing. The invoice
		// stays pending and visible to ops in /platform/subscriptions.
		response.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": "amount_mismatch"})
		return
	}

	switch mapped {
	case "paid":
		if inv.Status == "paid" {
			// Idempotent replay — just ack.
			response.JSON(w, http.StatusOK, map[string]any{"ok": true, "replay": true})
			return
		}
		sub, settled, err := h.subs.SettleInvoice(r.Context(), inv.ID)
		if errors.Is(err, repository.ErrInvoiceNotPending) {
			// Concurrent duplicate delivery won the race, or the invoice
			// was already failed/rejected. Ack without touching the
			// subscription — one payment must never buy two periods.
			h.logger.Info("platform webhook: settle skipped (not pending)",
				"order_id", n.OrderID, "invoice_id", inv.ID)
			response.JSON(w, http.StatusOK, map[string]any{"ok": true, "replay": true})
			return
		}
		if err != nil {
			h.logger.Error("platform webhook: settle", "err", err, "order_id", n.OrderID)
			response.Error(w, http.StatusInternalServerError, "settle failed")
			return
		}
		h.logger.Info("subscription settled",
			"order_id", n.OrderID,
			"store_id", settled.StoreID,
			"plan", sub.Plan,
			"period_end", sub.CurrentPeriodEnd)
		// Webhook context has no user; audit logger records this with
		// empty actor — surfaces in the UI as "Sistem (Midtrans)".
		h.audit.Log(r.Context(), settled.StoreID, audit.Event{
			Action:     "subscription.settled",
			EntityType: "invoice",
			EntityID:   settled.ID.String(),
			Summary:    "Pembayaran " + sub.Plan + " berhasil diterima (" + n.OrderID + ")",
			Metadata: map[string]any{
				"order_id":     n.OrderID,
				"plan":         sub.Plan,
				"amount_cents": settled.AmountCents,
				"months":       settled.Months,
				"channel":      "midtrans_snap",
			},
		})
		response.JSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"invoice_id": settled.ID.String(),
			"plan":       sub.Plan,
		})
	case "failed":
		if err := h.subs.MarkInvoiceFailed(r.Context(), inv.ID); err != nil {
			h.logger.Error("platform webhook: mark failed", "err", err)
		}
		response.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": "failed"})
	default:
		// pending / authorize — nothing to persist yet.
		response.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": mapped})
	}
}

// handlePhotoBooth settles a PhotoBoost session.
//
// The settle itself lives in SettlePhotoBoothSession, shared with the booth's
// poll-time reconcile, so a lost webhook and a delivered one converge on the
// same row through the same guard.
func (h *PlatformWebhookHandler) handlePhotoBooth(w http.ResponseWriter, r *http.Request, n platformNotification) {
	s, err := h.booth.FindByProviderOrderID(r.Context(), n.OrderID)
	if err != nil {
		h.logger.Warn("platform webhook: photobooth session not found", "order_id", n.OrderID)
		response.Error(w, http.StatusNotFound, "session not found")
		return
	}

	mapped := payments.MapTransactionStatus(n.TransactionStatus, n.FraudStatus)
	switch mapped {
	case "paid":
		change, err := SettlePhotoBoothSession(r.Context(), h.booth, h.logger, s, n.GrossAmount, n.TransactionID)
		if err != nil {
			h.logger.Error("platform webhook: photobooth settle", "err", err, "order_id", n.OrderID)
			response.Error(w, http.StatusInternalServerError, "settle failed")
			return
		}
		if change == nil {
			// Replay, concurrent winner, or an amount mismatch that was
			// flagged rather than settled. Ack either way so Midtrans stops
			// retrying; the admin tab is where a mismatch surfaces.
			response.JSON(w, http.StatusOK, map[string]any{"ok": true, "replay": true})
			return
		}
		h.logger.Info("photobooth session settled",
			"session", change.SessionNumber, "amount_cents", change.AmountCents)
		response.JSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"session": change.SessionNumber,
		})
	case "failed":
		// Leave the row alone beyond the expiry the booth already applies: a
		// 'failed' notification for an unpaid QR is the normal end of an
		// abandoned session, not an incident.
		response.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": "failed"})
	default:
		response.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": mapped})
	}
}
