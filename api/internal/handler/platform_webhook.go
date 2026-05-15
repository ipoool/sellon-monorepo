package handler

import (
	"encoding/json"
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
	serverKey string
	audit     *audit.Logger
	logger    *slog.Logger
}

func NewPlatformWebhookHandler(subs *repository.SubscriptionRepo, serverKey string, audit *audit.Logger, logger *slog.Logger) *PlatformWebhookHandler {
	return &PlatformWebhookHandler{subs: subs, serverKey: serverKey, audit: audit, logger: logger}
}

type platformNotification struct {
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
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

	// Only handle our subscription order_ids; ignore anything else.
	if !strings.HasPrefix(n.OrderID, "SUB-") {
		response.JSON(w, http.StatusOK, map[string]any{"ignored": true})
		return
	}

	inv, err := h.subs.FindInvoiceByProviderOrderID(r.Context(), n.OrderID)
	if err != nil {
		h.logger.Warn("platform webhook: invoice not found", "order_id", n.OrderID)
		response.Error(w, http.StatusNotFound, "invoice not found")
		return
	}

	mapped := payments.MapTransactionStatus(n.TransactionStatus, n.FraudStatus)
	switch mapped {
	case "paid":
		if inv.Status == "paid" {
			// Idempotent replay — just ack.
			response.JSON(w, http.StatusOK, map[string]any{"ok": true, "replay": true})
			return
		}
		sub, settled, err := h.subs.SettleInvoice(r.Context(), inv.ID)
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
