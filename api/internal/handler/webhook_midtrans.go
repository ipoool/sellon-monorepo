package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type WebhookHandler struct {
	gateways  *repository.PaymentRepo
	orders    *repository.OrderRepo
	encryptor *auth.AESEncryptor
	logger    *slog.Logger
}

func NewWebhookHandler(g *repository.PaymentRepo, o *repository.OrderRepo, enc *auth.AESEncryptor, logger *slog.Logger) *WebhookHandler {
	return &WebhookHandler{gateways: g, orders: o, encryptor: enc, logger: logger}
}

// Midtrans notification payload — only the fields we use.
// Full schema: https://docs.midtrans.com/reference/notification-payload
type midtransNotification struct {
	OrderID           string `json:"order_id"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	PaymentType       string `json:"payment_type"`
}

// POST /webhooks/midtrans/{token}
//
// Public — no auth required (token in URL is the secret). Always returns
// 200 OK on success so Midtrans doesn't retry-storm; misroutes return 404.
func (h *WebhookHandler) Midtrans(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		response.Error(w, http.StatusNotFound, "not found")
		return
	}

	gateway, err := h.gateways.FindByWebhookToken(r.Context(), token)
	if errors.Is(err, repository.ErrGatewayNotFound) {
		// Don't leak that the token is wrong vs the seller existing.
		response.Error(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		h.logger.Error("webhook find gateway", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	var n midtransNotification
	if err := json.NewDecoder(r.Body).Decode(&n); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}

	// Pick the env's server key — Midtrans signs with the same key the seller used.
	var encryptedKey []byte
	if gateway.IsSandbox {
		encryptedKey = gateway.ServerKeySandboxEncrypted
	} else {
		encryptedKey = gateway.ServerKeyProdEncrypted
	}
	if len(encryptedKey) == 0 {
		h.logger.Warn("webhook: gateway has no server key for active env",
			"gateway_id", gateway.ID, "is_sandbox", gateway.IsSandbox)
		response.Error(w, http.StatusUnprocessableEntity, "gateway not fully configured")
		return
	}
	serverKeyBytes, err := h.encryptor.Decrypt(encryptedKey)
	if err != nil {
		h.logger.Error("webhook: decrypt server key", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	serverKey := string(serverKeyBytes)

	if !payments.VerifySignature(n.OrderID, n.StatusCode, n.GrossAmount, serverKey, n.SignatureKey) {
		h.logger.Warn("webhook: signature mismatch",
			"order_id", n.OrderID, "gateway_id", gateway.ID)
		response.Error(w, http.StatusUnauthorized, "signature mismatch")
		return
	}

	order, err := h.orders.FindByOrderNumber(r.Context(), gateway.StoreID, n.OrderID)
	if errors.Is(err, repository.ErrOrderNotFound) {
		h.logger.Warn("webhook: order not found",
			"order_id", n.OrderID, "gateway_id", gateway.ID)
		// Still return 200 so Midtrans stops retrying.
		response.JSON(w, http.StatusOK, map[string]string{"status": "order_not_found"})
		return
	}
	if err != nil {
		h.logger.Error("webhook: find order", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	mappedStatus := payments.MapTransactionStatus(n.TransactionStatus, n.FraudStatus)
	if mappedStatus == "" {
		h.logger.Info("webhook: unhandled transaction_status",
			"transaction_status", n.TransactionStatus, "order_id", n.OrderID)
		response.JSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	if err := h.orders.SetPaymentStatus(r.Context(), gateway.StoreID, order.ID, mappedStatus, n.PaymentType); err != nil {
		h.logger.Error("webhook: update payment status", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.logger.Info("webhook: payment status updated",
		"order_id", n.OrderID, "from", order.PaymentStatus, "to", mappedStatus)
	response.JSON(w, http.StatusOK, map[string]string{
		"status":         "ok",
		"payment_status": mappedStatus,
	})
}
