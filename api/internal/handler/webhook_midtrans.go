package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/fulfillment"
	"github.com/sellon/sellon/api/internal/meta"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type WebhookHandler struct {
	gateways  *repository.PaymentRepo
	orders    *repository.OrderRepo
	stores    *repository.StoreRepo
	users     *repository.UserRepo
	encryptor *auth.AESEncryptor
	mailer    *email.Mailer
	fulfiller *fulfillment.Fulfiller
	meta      *meta.Notifier
	webOrigin string
	logger    *slog.Logger
}

func NewWebhookHandler(
	g *repository.PaymentRepo,
	o *repository.OrderRepo,
	s *repository.StoreRepo,
	u *repository.UserRepo,
	enc *auth.AESEncryptor,
	mailer *email.Mailer,
	fulfiller *fulfillment.Fulfiller,
	metaNotifier *meta.Notifier,
	webOrigin string,
	logger *slog.Logger,
) *WebhookHandler {
	return &WebhookHandler{
		gateways: g, orders: o, stores: s, users: u,
		encryptor: enc,
		mailer:    mailer,
		fulfiller: fulfiller,
		meta:      metaNotifier,
		webOrigin: webOrigin,
		logger:    logger,
	}
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
	// Present on refund / partial_refund notifications: the cumulative amount
	// refunded so far, same "150000.00" rupiah formatting as gross_amount.
	RefundAmount string `json:"refund_amount"`
}

// rupiahToCents parses Midtrans' amount formatting ("150000.00", sometimes
// "150000") into our cents unit. Returns ok=false for anything unparseable so
// callers can skip the comparison rather than act on a bogus number.
func rupiahToCents(s string) (int64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	whole, frac, _ := strings.Cut(s, ".")
	rupiah, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, false
	}
	cents := rupiah * 100
	if frac != "" {
		if len(frac) > 2 {
			frac = frac[:2]
		}
		for len(frac) < 2 {
			frac += "0"
		}
		c, err := strconv.ParseInt(frac, 10, 64)
		if err != nil {
			return 0, false
		}
		cents += c
	}
	return cents, true
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

	// Midtrans signs with the seller's (production) server key.
	encryptedKey := gateway.ServerKeyProdEncrypted
	if len(encryptedKey) == 0 {
		h.logger.Warn("webhook: gateway has no server key",
			"gateway_id", gateway.ID)
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

	// Refund notifications never go through the payment-status path: a refund
	// has to account for money AND stock, and a partial refund must stay
	// 'paid'. Route them to the same repo refund path the seller UI uses.
	if n.TransactionStatus == "refund" || n.TransactionStatus == "partial_refund" {
		h.handleGatewayRefund(r.Context(), gateway.StoreID, order, n)
		response.JSON(w, http.StatusOK, map[string]string{
			"status":         "ok",
			"payment_status": n.TransactionStatus,
		})
		return
	}

	mappedStatus := payments.MapTransactionStatus(n.TransactionStatus, n.FraudStatus)
	if mappedStatus == "" {
		h.logger.Info("webhook: unhandled transaction_status",
			"transaction_status", n.TransactionStatus, "order_id", n.OrderID)
		response.JSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	// Amount integrity: what Midtrans says was charged must match what we
	// billed. A mismatch is never auto-fulfilled.
	amountMismatch := false
	if cents, ok := rupiahToCents(n.GrossAmount); ok && cents != order.TotalCents {
		amountMismatch = true
		h.logger.Warn("webhook: gross_amount mismatch",
			"order_id", n.OrderID, "midtrans_cents", cents, "order_cents", order.TotalCents)
	}

	// One atomic guarded write that also hands back the pre-update values, so
	// nothing (expiry worker, a concurrent notification) can slip between the
	// read and the write. 0 rows = the order is already in a stronger payment
	// state → replay, ack with no side effects.
	change, err := h.orders.SetPaymentStatusGuarded(
		r.Context(), gateway.StoreID, order.ID, mappedStatus, n.PaymentType)
	if errors.Is(err, repository.ErrPaymentStatusUnchanged) {
		h.logger.Info("webhook: ignored replay / stale status",
			"order_id", n.OrderID, "incoming", mappedStatus, "current", order.PaymentStatus)
		response.JSON(w, http.StatusOK, map[string]string{"status": "already_settled"})
		return
	}
	if err != nil {
		h.logger.Error("webhook: update payment status", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.logger.Info("webhook: payment status updated",
		"order_id", n.OrderID, "from", change.PrevPaymentStatus, "to", mappedStatus)

	// Branch on what the UPDATE actually returned — guaranteed atomic with the
	// write, so each side effect fires exactly once.
	switch {
	case mappedStatus == "paid" && change.PrevStatus == "cancelled":
		// Payment landed on an order that was already cancelled (e.g. the buyer
		// paid after auto-expiry already released its stock/kuota). Do NOT
		// auto-fulfill — the inventory may be gone/re-sold. Record the payment
		// (done above) but flag for the seller to refund or re-activate manually.
		if rErr := h.orders.FlagNeedsReview(r.Context(), gateway.StoreID, order.ID,
			"Dibayar setelah order dibatalkan — cek lalu refund atau aktifkan manual"); rErr != nil {
			h.logger.Error("webhook: flag needs_review", "err", rErr, "order_id", n.OrderID)
		}
		h.logger.Warn("webhook: payment on cancelled order — flagged for review",
			"order_id", n.OrderID)

	case mappedStatus == "paid" && amountMismatch:
		// Money landed but not the amount we billed (price edited mid-checkout,
		// tampered Snap request, partial capture). Record it, but never mint
		// tokens or send delivery emails off a number we can't reconcile.
		if rErr := h.orders.FlagNeedsReview(r.Context(), gateway.StoreID, order.ID,
			"Nominal pembayaran tidak sama dengan total pesanan — cek di dashboard Midtrans"); rErr != nil {
			h.logger.Error("webhook: flag needs_review", "err", rErr, "order_id", n.OrderID)
		}

	case mappedStatus == "paid":
		// Normal fresh payment. Fire side-effects once.
		go h.emailPaymentReceived(gateway.StoreID, order, n.PaymentType)
		// Digital fulfillment: auto-complete + mint download tokens + email buyer.
		// Background context so this survives the webhook HTTP handler returning.
		go h.fulfiller.OnPaymentPaid(context.Background(), gateway.StoreID, order.ID)
		// Meta Conversions API: server-side Purchase for ad attribution. No-op
		// when the store hasn't enabled Meta.
		if h.meta != nil {
			go h.meta.OnPaymentPaid(context.Background(), gateway.StoreID, order.ID)
		}

	case mappedStatus == "failed" &&
		change.PrevStatus == "pending" &&
		strings.TrimSpace(order.PaymentProofURL) == "":
		// Midtrans expire/cancel/deny on a still-open order (unpaid OR a pending
		// VA/bank charge that lapsed): cancel it now so its stock + kuota + promo
		// are released. The order-expiry worker only matches payment_status=
		// 'unpaid', so a 'failed'/'pending' order would otherwise hold inventory
		// forever until a manual cancel. Never touches an already-paid order.
		if cErr := h.orders.Cancel(r.Context(), gateway.StoreID, order.ID,
			"Pembayaran gagal / kadaluwarsa (Midtrans)"); cErr != nil {
			h.logger.Error("webhook: cancel on failed payment", "err", cErr, "order_id", n.OrderID)
		}
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"status":         "ok",
		"payment_status": mappedStatus,
	})
}

// handleGatewayRefund books a refund the seller issued from their Midtrans
// dashboard. Previously these notifications only flipped payment_status, so no
// amount was recorded, stock/kuota never came back, a partial refund looked
// like a full one, and the seller's own refund button then refused with
// "pesanan tidak bisa direfund" because the order was no longer 'paid'.
func (h *WebhookHandler) handleGatewayRefund(ctx context.Context, storeID uuid.UUID, order *repository.Order, n midtransNotification) {
	const reason = "Refund via dashboard Midtrans"

	// refund_amount is the cumulative amount refunded; fall back to the full
	// gross when Midtrans omits it.
	amountCents, ok := rupiahToCents(n.RefundAmount)
	if !ok || amountCents <= 0 {
		amountCents, ok = rupiahToCents(n.GrossAmount)
	}
	if !ok || amountCents <= 0 {
		h.logger.Warn("webhook: refund without a parseable amount",
			"order_id", n.OrderID, "refund_amount", n.RefundAmount, "gross_amount", n.GrossAmount)
		return
	}
	if amountCents > order.TotalCents {
		amountCents = order.TotalCents
	}

	if n.TransactionStatus == "partial_refund" {
		// Still a sale, just a smaller one — keep payment_status='paid' and
		// record how much went back, so a later full refund is still possible.
		if err := h.orders.RecordPartialRefund(ctx, storeID, order.ID, amountCents, reason); err != nil {
			h.logger.Warn("webhook: record partial refund",
				"err", err, "order_id", n.OrderID, "amount_cents", amountCents)
			return
		}
		h.logger.Info("webhook: partial refund recorded",
			"order_id", n.OrderID, "amount_cents", amountCents)
		return
	}

	// Full refund: same path as the seller's refund button — flips
	// payment_status, cancels the order and restores stock / kuota / promo /
	// materials.
	if err := h.orders.Refund(ctx, storeID, order.ID, amountCents, reason); err != nil {
		if errors.Is(err, repository.ErrRefundNotAllowed) {
			// Already refunded (replayed notification) or never paid.
			h.logger.Info("webhook: refund notification ignored",
				"order_id", n.OrderID, "current_payment_status", order.PaymentStatus)
			return
		}
		h.logger.Error("webhook: apply refund", "err", err, "order_id", n.OrderID)
		return
	}
	h.logger.Info("webhook: refund applied",
		"order_id", n.OrderID, "amount_cents", amountCents)
}

func (h *WebhookHandler) emailPaymentReceived(storeID uuid.UUID, order *repository.Order, paymentType string) {
	// Detached context — webhook caller doesn't wait for the email.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if !h.mailer.Configured() || h.stores == nil || h.users == nil {
		return
	}
	store, err := h.stores.FindByID(ctx, storeID)
	if err != nil || store == nil {
		return
	}
	owner, err := h.users.FindByID(ctx, store.OwnerID)
	if err != nil || owner == nil || owner.Email == "" {
		return
	}

	method := strings.TrimSpace(paymentType)
	if method == "" {
		method = order.PaymentMethod
	}

	subject, text, htmlBody := email.RenderPaymentReceived(email.PaymentReceivedData{
		StoreName:         store.Name,
		OrderNumber:       order.OrderNumber,
		CustomerName:      order.CustomerName,
		TotalCents:        order.TotalCents,
		PaymentMethod:     method,
		OrderDashboardURL: strings.TrimRight(h.webOrigin, "/") + "/dashboard/orders",
	})
	h.mailer.Send(email.Message{
		To:       owner.Email,
		ToName:   owner.Name,
		Subject:  subject,
		Text:     text,
		HTML:     htmlBody,
		Category: "order_paid",
	})
}
