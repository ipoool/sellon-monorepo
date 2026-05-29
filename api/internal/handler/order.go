package handler

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/fulfillment"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type OrderHandler struct {
	orders    *repository.OrderRepo
	stores    *repository.StoreRepo
	gateways  *repository.PaymentRepo
	encryptor *auth.AESEncryptor
	midtrans  *payments.MidtransClient
	audit     *audit.Logger
	fulfiller *fulfillment.Fulfiller
	mailer    *email.Mailer
	webOrigin string
	logger    *slog.Logger
}

func NewOrderHandler(
	orders *repository.OrderRepo,
	stores *repository.StoreRepo,
	gateways *repository.PaymentRepo,
	enc *auth.AESEncryptor,
	midtrans *payments.MidtransClient,
	audit *audit.Logger,
	fulfiller *fulfillment.Fulfiller,
	mailer *email.Mailer,
	webOrigin string,
	logger *slog.Logger,
) *OrderHandler {
	return &OrderHandler{
		orders: orders, stores: stores, gateways: gateways,
		encryptor: enc, midtrans: midtrans, audit: audit,
		fulfiller: fulfiller,
		mailer:    mailer,
		webOrigin: webOrigin,
		logger:    logger,
	}
}

type orderListItemDTO struct {
	ID               string `json:"id"`
	OrderNumber      string `json:"order_number"`
	Status           string `json:"status"`
	PaymentStatus    string `json:"payment_status"`
	PaymentMethod    string `json:"payment_method"`
	SubtotalCents    int64  `json:"subtotal_cents"`
	ShippingCents    int64  `json:"shipping_cents"`
	TotalCents       int64  `json:"total_cents"`
	Courier          string `json:"courier"`
	CustomerName     string `json:"customer_name"`
	CustomerWhatsApp string `json:"customer_whatsapp"`
	CustomerCity     string `json:"customer_city"`
	CreatedAt        string `json:"created_at"`
}

type orderItemDTO struct {
	ID             string           `json:"id"`
	ProductName    string           `json:"product_name"`
	VariantName    string           `json:"variant_name"`
	UnitPriceCents int64            `json:"unit_price_cents"`
	Quantity       int              `json:"quantity"`
	SubtotalCents  int64            `json:"subtotal_cents"`
	ServingType    string           `json:"serving_type,omitempty"`
	Modifiers      []map[string]any `json:"modifiers,omitempty"`
}

func optionSnapsToDTO(snaps []repository.OptionSnapshot) []map[string]any {
	out := make([]map[string]any, 0, len(snaps))
	for _, s := range snaps {
		out = append(out, map[string]any{
			"group_name":        s.GroupName,
			"option_name":       s.OptionName,
			"price_delta_cents": s.PriceDeltaCents,
		})
	}
	return out
}

type orderDetailDTO struct {
	ID                 string         `json:"id"`
	OrderNumber        string         `json:"order_number"`
	Status             string         `json:"status"`
	PaymentStatus      string         `json:"payment_status"`
	PaymentMethod      string         `json:"payment_method"`
	Source             string         `json:"source"`
	SubtotalCents      int64          `json:"subtotal_cents"`
	ShippingCents      int64          `json:"shipping_cents"`
	DiscountCents      int64          `json:"discount_cents"`
	PromoCode          string         `json:"promo_code"`
	TotalCents         int64          `json:"total_cents"`
	LoyaltyPointsRedeemed int         `json:"loyalty_points_redeemed"`
	LoyaltyDiscountCents  int64       `json:"loyalty_discount_cents"`
	Courier            string         `json:"courier"`
	CourierService     string         `json:"courier_service"`
	TrackingNumber     string         `json:"tracking_number"`
	CustomerName       string         `json:"customer_name"`
	CustomerWhatsApp   string         `json:"customer_whatsapp"`
	CustomerAddress    string         `json:"customer_address"`
	CustomerCity       string         `json:"customer_city"`
	Notes              string         `json:"notes"`
	SellerNotes        string         `json:"seller_notes"`
	PaymentURL         string         `json:"payment_url"`
	PaidAt             *string        `json:"paid_at"`
	ShippedAt          *string        `json:"shipped_at"`
	CompletedAt        *string        `json:"completed_at"`
	CancelledAt        *string        `json:"cancelled_at"`
	CancellationReason string         `json:"cancellation_reason"`
	RefundAmountCents  int64          `json:"refund_amount_cents"`
	RefundReason       string         `json:"refund_reason"`
	RefundedAt         *string        `json:"refunded_at"`
	PaymentProofURL    string         `json:"payment_proof_url"`
	PaymentProofNote   string         `json:"payment_proof_note"`
	PaymentProofAt     *string        `json:"payment_proof_at"`
	CreatedAt          string         `json:"created_at"`
	UpdatedAt          string         `json:"updated_at"`
	Items              []orderItemDTO `json:"items"`
}

func formatTime(t interface{ Format(string) string }) string {
	return t.Format("2006-01-02T15:04:05Z07:00")
}

// GET /api/v1/orders?q=&status=&payment_status=
func (h *OrderHandler) List(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"orders": []orderListItemDTO{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit == 0 {
		limit = 25
	}
	offset, _ := strconv.Atoi(q.Get("offset"))

	rows, total, err := h.orders.List(r.Context(), repository.ListOrdersFilter{
		StoreID:       store.ID,
		Search:        strings.TrimSpace(q.Get("q")),
		Status:        q.Get("status"),
		PaymentStatus: q.Get("payment_status"),
		Limit:         limit,
		Offset:        offset,
	})
	if err != nil {
		h.logger.Error("list orders", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]orderListItemDTO, 0, len(rows))
	for _, o := range rows {
		out = append(out, orderListItemDTO{
			ID: o.ID.String(), OrderNumber: o.OrderNumber,
			Status: o.Status, PaymentStatus: o.PaymentStatus, PaymentMethod: o.PaymentMethod,
			SubtotalCents: o.SubtotalCents, ShippingCents: o.ShippingCents, TotalCents: o.TotalCents,
			Courier: o.Courier,
			CustomerName: o.CustomerName, CustomerWhatsApp: o.CustomerWhatsApp, CustomerCity: o.CustomerCity,
			CreatedAt: o.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"orders": out, "total": total})
}

// GET /api/v1/orders/export — CSV download (uses same filter params)
func (h *OrderHandler) Export(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	q := r.URL.Query()
	rows, _, err := h.orders.List(r.Context(), repository.ListOrdersFilter{
		StoreID:       store.ID,
		Search:        strings.TrimSpace(q.Get("q")),
		Status:        q.Get("status"),
		PaymentStatus: q.Get("payment_status"),
		Limit:         1000,
	})
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="pesanan-`+time.Now().Format("2006-01-02")+`.csv"`)
	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{
		"No. Order", "Tanggal", "Status", "Pembayaran", "Metode",
		"Pembeli", "WhatsApp", "Kota", "Kurir",
		"Subtotal (Rp)", "Ongkir (Rp)", "Total (Rp)",
	})
	for _, o := range rows {
		_ = cw.Write([]string{
			o.OrderNumber,
			o.CreatedAt.Format("2006-01-02 15:04"),
			o.Status, o.PaymentStatus, o.PaymentMethod,
			o.CustomerName, o.CustomerWhatsApp, o.CustomerCity, o.Courier,
			strconv.FormatInt(o.SubtotalCents/100, 10),
			strconv.FormatInt(o.ShippingCents/100, 10),
			strconv.FormatInt(o.TotalCents/100, 10),
		})
	}
}

// GET /api/v1/orders/{id}
func (h *OrderHandler) Get(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	o, err := h.orders.FindByID(r.Context(), store.ID, id)
	if errors.Is(err, repository.ErrOrderNotFound) {
		response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("get order", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	items, err := h.orders.ListItems(r.Context(), o.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	modsByItem, _ := h.orders.ListModifiersByOrder(r.Context(), o.ID)
	itemsDTO := make([]orderItemDTO, 0, len(items))
	for _, it := range items {
		dto := orderItemDTO{
			ID: it.ID.String(), ProductName: it.ProductName, VariantName: it.VariantName,
			UnitPriceCents: it.UnitPriceCents, Quantity: it.Quantity, SubtotalCents: it.SubtotalCents,
			ServingType: it.ServingType,
		}
		if m := modsByItem[it.ID]; len(m) > 0 {
			dto.Modifiers = optionSnapsToDTO(m)
		}
		itemsDTO = append(itemsDTO, dto)
	}
	response.JSON(w, http.StatusOK, map[string]any{"order": orderDetailToDTO(o, itemsDTO)})
}

func orderDetailToDTO(o *repository.Order, items []orderItemDTO) orderDetailDTO {
	var paid, shipped, completed, cancelled, refunded *string
	if o.PaidAt != nil {
		s := formatTime(o.PaidAt)
		paid = &s
	}
	if o.ShippedAt != nil {
		s := formatTime(o.ShippedAt)
		shipped = &s
	}
	if o.CompletedAt != nil {
		s := formatTime(o.CompletedAt)
		completed = &s
	}
	if o.CancelledAt != nil {
		s := formatTime(o.CancelledAt)
		cancelled = &s
	}
	if o.RefundedAt != nil {
		s := formatTime(o.RefundedAt)
		refunded = &s
	}
	var proofAt *string
	if o.PaymentProofAt != nil {
		s := formatTime(o.PaymentProofAt)
		proofAt = &s
	}
	return orderDetailDTO{
		ID: o.ID.String(), OrderNumber: o.OrderNumber,
		Status: o.Status, PaymentStatus: o.PaymentStatus, PaymentMethod: o.PaymentMethod,
		Source:        o.Source,
		SubtotalCents: o.SubtotalCents, ShippingCents: o.ShippingCents,
		DiscountCents: o.DiscountCents, PromoCode: o.PromoCode,
		TotalCents:            o.TotalCents,
		LoyaltyPointsRedeemed: o.LoyaltyPointsRedeemed,
		LoyaltyDiscountCents:  o.LoyaltyDiscountCents,
		Courier: o.Courier, CourierService: o.CourierService, TrackingNumber: o.TrackingNumber,
		CustomerName: o.CustomerName, CustomerWhatsApp: o.CustomerWhatsApp,
		CustomerAddress: o.CustomerAddress, CustomerCity: o.CustomerCity,
		Notes: o.Notes, SellerNotes: o.SellerNotes, PaymentURL: o.PaymentURL,
		PaidAt: paid, ShippedAt: shipped, CompletedAt: completed, CancelledAt: cancelled,
		CancellationReason: o.CancellationReason,
		RefundAmountCents:  o.RefundAmountCents,
		RefundReason:       o.RefundReason,
		RefundedAt:         refunded,
		PaymentProofURL:    o.PaymentProofURL,
		PaymentProofNote:   o.PaymentProofNote,
		PaymentProofAt:     proofAt,
		CreatedAt:          o.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:          o.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		Items:              items,
	}
}

type statusActionReq struct {
	Action             string `json:"action"`
	TrackingNumber     string `json:"tracking_number"`
	Courier            string `json:"courier"`
	CourierService     string `json:"courier_service"`
	CancellationReason string `json:"cancellation_reason"`
	// Refund-only:
	RefundAmountCents int64  `json:"refund_amount_cents"`
	RefundReason      string `json:"refund_reason"`
}

// PATCH /api/v1/orders/{id}/status
func (h *OrderHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req statusActionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	var actionErr error
	switch req.Action {
	case "confirm":
		actionErr = h.orders.Confirm(r.Context(), store.ID, id)
	case "process":
		actionErr = h.orders.Process(r.Context(), store.ID, id)
	case "ship":
		if strings.TrimSpace(req.TrackingNumber) == "" {
			response.Error(w, http.StatusBadRequest, "nomor resi wajib diisi")
			return
		}
		actionErr = h.orders.Ship(r.Context(), store.ID, id, req.Courier, req.CourierService, req.TrackingNumber)
	case "complete":
		actionErr = h.orders.Complete(r.Context(), store.ID, id)
	case "cancel":
		actionErr = h.orders.Cancel(r.Context(), store.ID, id, req.CancellationReason)
	case "mark_paid":
		actionErr = h.orders.MarkPaid(r.Context(), store.ID, id)
	case "refund":
		if strings.TrimSpace(req.RefundReason) == "" {
			response.Error(w, http.StatusBadRequest, "alasan refund wajib diisi")
			return
		}
		if req.RefundAmountCents <= 0 {
			response.Error(w, http.StatusBadRequest, "nominal refund harus > 0")
			return
		}
		// If the order was paid via Midtrans, hit the direct-refund API
		// FIRST. Only persist the refund record after Midtrans confirms,
		// otherwise the seller's books would say "refunded" while the
		// money never moved. For non-Midtrans methods (manual transfer /
		// QRIS statis / WA confirm) we skip straight to the DB write —
		// the seller is responsible for moving the money themselves.
		current, err := h.orders.FindByID(r.Context(), store.ID, id)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		if payments.IsMidtransPaymentMethod(current.PaymentMethod) {
			gateway, err := h.gateways.Get(r.Context(), store.ID, "midtrans")
			if errors.Is(err, repository.ErrGatewayNotFound) {
				response.Error(w, http.StatusBadRequest,
					"konfigurasi Midtrans tidak ditemukan - tidak bisa proses refund otomatis")
				return
			}
			if err != nil {
				h.logger.Error("refund: load gateway", "err", err)
				response.Error(w, http.StatusInternalServerError, "internal error")
				return
			}
			var encryptedKey []byte
			if gateway.IsSandbox {
				encryptedKey = gateway.ServerKeySandboxEncrypted
			} else {
				encryptedKey = gateway.ServerKeyProdEncrypted
			}
			if len(encryptedKey) == 0 {
				response.Error(w, http.StatusBadRequest,
					"Server Key Midtrans untuk mode aktif belum diisi - tidak bisa proses refund otomatis")
				return
			}
			keyBytes, err := h.encryptor.Decrypt(encryptedKey)
			if err != nil {
				h.logger.Error("refund: decrypt server key", "err", err)
				response.Error(w, http.StatusInternalServerError, "internal error")
				return
			}
			refundKey := fmt.Sprintf("rfd-%s-%d", current.OrderNumber, time.Now().Unix())
			if _, err := h.midtrans.Refund(payments.RefundInput{
				OrderNumber: current.OrderNumber,
				AmountCents: req.RefundAmountCents,
				Reason:      req.RefundReason,
				RefundKey:   refundKey,
				IsSandbox:   gateway.IsSandbox,
				ServerKey:   string(keyBytes),
			}); err != nil {
				h.logger.Warn("midtrans refund failed",
					"err", err, "order", current.OrderNumber)
				response.Error(w, http.StatusBadGateway,
					"Midtrans menolak refund: "+err.Error())
				return
			}
		}
		actionErr = h.orders.Refund(r.Context(), store.ID, id, req.RefundAmountCents, req.RefundReason)
	default:
		response.Error(w, http.StatusBadRequest, "action tidak dikenal")
		return
	}

	if errors.Is(actionErr, repository.ErrInvalidTransition) {
		response.Error(w, http.StatusBadRequest, "transisi status tidak valid untuk pesanan ini")
		return
	}
	if errors.Is(actionErr, repository.ErrRefundNotAllowed) {
		response.Error(w, http.StatusBadRequest, "pesanan tidak bisa direfund (cek status pembayaran & nominal)")
		return
	}
	if actionErr != nil {
		h.logger.Error("order status action", "action", req.Action, "err", actionErr)
		response.Error(w, http.StatusInternalServerError, "gagal update status")
		return
	}

	// Return updated order
	o, err := h.orders.FindByID(r.Context(), store.ID, id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	items, _ := h.orders.ListItems(r.Context(), o.ID)
	itemsDTO := make([]orderItemDTO, 0, len(items))
	for _, it := range items {
		itemsDTO = append(itemsDTO, orderItemDTO{
			ID: it.ID.String(), ProductName: it.ProductName, VariantName: it.VariantName,
			UnitPriceCents: it.UnitPriceCents, Quantity: it.Quantity, SubtotalCents: it.SubtotalCents,
			ServingType: it.ServingType,
		})
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "order." + req.Action,
		EntityType: "order",
		EntityID:   o.ID.String(),
		Summary:    "Pesanan #" + o.OrderNumber + " " + statusVerbBahasa(req.Action),
		Metadata: map[string]any{
			"order_number":        o.OrderNumber,
			"new_status":          o.Status,
			"new_payment":         o.PaymentStatus,
			"tracking_number":     req.TrackingNumber,
			"reason":              req.CancellationReason,
			"refund_amount_cents": req.RefundAmountCents,
			"refund_reason":       req.RefundReason,
		},
	})

	// Notify buyer via email kalau mereka isi email saat checkout.
	// Mailer non-block (goroutine internal); transitional state diturunkan
	// dari `req.Action` agar wording sesuai.
	h.sendBuyerStatusEmail(store, o, req.Action, req.CancellationReason, req.RefundReason)

	// Manual mark-paid: trigger digital fulfillment if applicable.
	// Async — buyer/seller doesn't wait for tokens + email.
	if req.Action == "mark_paid" && o.PaymentStatus == "paid" {
		go h.fulfiller.OnPaymentPaid(context.Background(), store.ID, o.ID)
	}

	response.JSON(w, http.StatusOK, map[string]any{"order": orderDetailToDTO(o, itemsDTO)})
}

// statusVerbBahasa maps the wire action verb to a human Bahasa phrase
// for audit log summaries. Used only for display.
func statusVerbBahasa(action string) string {
	switch action {
	case "confirm":
		return "dikonfirmasi"
	case "process":
		return "diproses"
	case "ship":
		return "dikirim"
	case "complete":
		return "diselesaikan"
	case "cancel":
		return "dibatalkan"
	case "mark_paid":
		return "ditandai lunas"
	case "refund":
		return "direfund"
	default:
		return "diubah"
	}
}

// buyerStatusEmailCopy returns subject + plain-body untuk notifikasi
// status pesanan ke pembeli. Wording sengaja singkat dan ramah agar
// gak terasa spam.
func buyerStatusEmailCopy(action, storeName, orderNumber, cancelReason, refundReason string) (subject, intro string) {
	switch action {
	case "confirm":
		return "Pesanan #" + orderNumber + " dikonfirmasi",
			"Kabar baik! Pesanan kamu sudah dikonfirmasi oleh " + storeName +
				". Penjual akan segera memproses pesananmu."
	case "process":
		return "Pesanan #" + orderNumber + " sedang disiapkan",
			"Pesanan kamu di " + storeName + " sedang disiapkan untuk dikirim."
	case "ship":
		return "Pesanan #" + orderNumber + " sudah dikirim",
			"Pesanan kamu sudah dikirim oleh " + storeName +
				". Cek detail kurir dan nomor resi di halaman pesananmu."
	case "complete":
		return "Pesanan #" + orderNumber + " selesai",
			"Pesanan kamu di " + storeName + " sudah selesai. Terima kasih sudah belanja!"
	case "cancel":
		base := "Pesanan kamu di " + storeName + " dibatalkan."
		if r := strings.TrimSpace(cancelReason); r != "" {
			base += " Alasan: " + r
		}
		return "Pesanan #" + orderNumber + " dibatalkan", base
	case "mark_paid":
		return "Pembayaran pesanan #" + orderNumber + " diterima",
			"Pembayaran kamu untuk pesanan di " + storeName +
				" sudah dikonfirmasi. Penjual akan segera memproses pesananmu."
	case "refund":
		base := "Pesanan kamu di " + storeName + " di-refund."
		if r := strings.TrimSpace(refundReason); r != "" {
			base += " Alasan: " + r
		}
		return "Refund pesanan #" + orderNumber, base
	default:
		return "", ""
	}
}

// sendBuyerStatusEmail mengirim notifikasi status pesanan ke email
// pembeli kalau mereka isi saat checkout. No-op kalau email kosong /
// mailer tidak dikonfigurasi / action di luar daftar copy yang
// didukung. Mailer.Send sendiri async — pemanggil tidak terblok.
func (h *OrderHandler) sendBuyerStatusEmail(
	store *repository.Store,
	order *repository.Order,
	action, cancelReason, refundReason string,
) {
	if h.mailer == nil || !h.mailer.Configured() {
		return
	}
	to := strings.TrimSpace(order.CustomerEmail)
	if to == "" {
		return
	}
	subject, intro := buyerStatusEmailCopy(action, store.Name, order.OrderNumber, cancelReason, refundReason)
	if subject == "" {
		return
	}
	orderURL := strings.TrimRight(h.webOrigin, "/") +
		"/" + store.Slug + "/order/" + order.OrderNumber
	greeting := "Halo " + order.CustomerName + "!"
	if strings.TrimSpace(order.CustomerName) == "" {
		greeting = "Halo!"
	}

	text := greeting + "\n\n" + intro +
		"\n\nLihat status & detail pesanan: " + orderURL +
		"\n\n— Tim " + store.Name
	html := buildBuyerStatusHTML(greeting, intro, orderURL, store.Name)

	h.mailer.Send(email.Message{
		To:       to,
		ToName:   order.CustomerName,
		Subject:  subject,
		Text:     text,
		HTML:     html,
		Category: "order_status",
	})
}

// buildBuyerStatusHTML — pakai chrome SellOn (email.WrapHTML) supaya
// style konsisten dengan email transaksional lain (login, order
// notifications, dll): outer table abu-abu, card putih shadow, "SellOn"
// wordmark di header, footer kecil. Tombol CTA pakai warna brand
// #10b981 yang sama dengan email lain.
func buildBuyerStatusHTML(greeting, intro, orderURL, _ string) string {
	g := html.EscapeString(greeting)
	i := html.EscapeString(intro)
	u := html.EscapeString(orderURL)
	body := `
<h1 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0f172a;">` + g + `</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">` + i + `</p>
<p style="margin:0 0 8px;">
  <a href="` + u + `" style="display:inline-block;background:#10b981;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Lihat Status Pesanan</a>
</p>
<p style="margin:16px 0 0;font-size:12px;color:#64748b;">Atau buka link ini di browser:<br>
  <a href="` + u + `" style="color:#10b981;text-decoration:none;word-break:break-all;">` + u + `</a>
</p>`
	return email.WrapHTML(body)
}

type notesReq struct {
	SellerNotes string `json:"seller_notes"`
}

// PATCH /api/v1/orders/{id}/notes
func (h *OrderHandler) UpdateNotes(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req notesReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.orders.SetSellerNotes(r.Context(), store.ID, id, req.SellerNotes); err != nil {
		h.logger.Error("update notes", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan catatan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "order.notes_updated",
		EntityType: "order",
		EntityID:   id.String(),
		Summary:    "Update catatan internal pesanan",
		Metadata:   map[string]any{"has_notes": req.SellerNotes != ""},
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *OrderHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

type waLogReq struct {
	// Template key yang dipilih seller di UI: "order_confirmation",
	// "payment_link", atau "shipping_update". Determines audit action +
	// summary verb.
	Template string `json:"template"`
	// Pesan WA hasil fill template di FE — disimpan ke metadata supaya
	// admin/seller bisa lihat persis apa yang dikirim ke pembeli.
	Message string `json:"message"`
	// Tujuan nomor WA (display-only di metadata).
	Recipient string `json:"recipient"`
}

// POST /api/v1/orders/{id}/wa-log
//
// Catat pengiriman WhatsApp manual (tombol "Konfirmasi Pesanan" / "Kirim
// Link Pembayaran" / "Kirim Update Resi" di halaman detail order). Tidak
// benar-benar mengirim pesan — WA dibuka via `wa.me` link di browser
// pembeli; endpoint ini hanya record audit log supaya seller / admin
// bisa lihat di tab Aktivitas apa yang sudah dikirim.
func (h *OrderHandler) LogWASend(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req waLogReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.Template = strings.TrimSpace(req.Template)
	req.Message = strings.TrimSpace(req.Message)

	templateLabel, ok := waTemplateLabel(req.Template)
	if !ok {
		response.Error(w, http.StatusBadRequest, "template tidak dikenal")
		return
	}
	if req.Message == "" {
		response.Error(w, http.StatusBadRequest, "message wajib diisi")
		return
	}

	// Verify order exists and belongs to this store before logging.
	order, err := h.orders.FindByID(r.Context(), store.ID, id)
	if err != nil {
		if errors.Is(err, repository.ErrOrderNotFound) {
			response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
			return
		}
		h.logger.Error("wa log find order", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "order.wa_sent." + req.Template,
		EntityType: "order",
		EntityID:   order.ID.String(),
		Summary:    "Kirim WA " + templateLabel + " untuk pesanan #" + order.OrderNumber,
		Metadata: map[string]any{
			"order_number": order.OrderNumber,
			"template":     req.Template,
			"recipient":    req.Recipient,
			"message":      req.Message,
		},
	})

	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func waTemplateLabel(key string) (string, bool) {
	switch key {
	case "order_confirmation":
		return "Konfirmasi Pesanan", true
	case "payment_link":
		return "Link Pembayaran", true
	case "shipping_update":
		return "Update Resi", true
	default:
		return "", false
	}
}

// POST /api/v1/orders/{id}/payment-link
//
// Calls Midtrans Snap with the seller's decrypted server key (active env)
// and stores the redirect_url on the order. Idempotent if a URL is already
// stored — returns the cached one (Snap allows reuse for the same order_id
// until expiry).
func (h *OrderHandler) GeneratePaymentLink(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	order, err := h.orders.FindByID(r.Context(), store.ID, id)
	if errors.Is(err, repository.ErrOrderNotFound) {
		response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if order.Status == "cancelled" {
		response.Error(w, http.StatusBadRequest, "pesanan dibatalkan, tidak bisa generate link")
		return
	}
	if order.PaymentStatus == "paid" {
		response.Error(w, http.StatusBadRequest, "pesanan sudah lunas")
		return
	}

	gateway, err := h.gateways.Get(r.Context(), store.ID, "midtrans")
	if errors.Is(err, repository.ErrGatewayNotFound) {
		response.Error(w, http.StatusBadRequest, "konfigurasi Midtrans belum diisi — Pengaturan → Pembayaran")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	var encryptedKey []byte
	if gateway.IsSandbox {
		encryptedKey = gateway.ServerKeySandboxEncrypted
	} else {
		encryptedKey = gateway.ServerKeyProdEncrypted
	}
	if len(encryptedKey) == 0 {
		response.Error(w, http.StatusBadRequest,
			"Server Key untuk mode aktif belum diisi")
		return
	}
	keyBytes, err := h.encryptor.Decrypt(encryptedKey)
	if err != nil {
		h.logger.Error("decrypt server key", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal decrypt key")
		return
	}

	items, err := h.orders.ListItems(r.Context(), order.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	snapItems := make([]payments.SnapItem, 0, len(items))
	for _, it := range items {
		snapItems = append(snapItems, payments.SnapItem{
			ID: it.ID.String(), Name: it.ProductName,
			Price: it.UnitPriceCents, Quantity: it.Quantity,
		})
	}
	if order.ShippingCents > 0 {
		snapItems = append(snapItems, payments.SnapItem{
			ID: "shipping", Name: "Ongkos Kirim",
			Price: order.ShippingCents, Quantity: 1,
		})
	}

	snap, err := h.midtrans.CreateSnapTransaction(payments.SnapTransactionInput{
		OrderID:       order.OrderNumber,
		GrossAmount:   order.TotalCents,
		CustomerName:  order.CustomerName,
		CustomerPhone: order.CustomerWhatsApp,
		Items:         snapItems,
		IsSandbox:     gateway.IsSandbox,
		ServerKey:     string(keyBytes),
	})
	if err != nil {
		h.logger.Warn("midtrans snap failed", "err", err, "order", order.OrderNumber)
		response.Error(w, http.StatusBadGateway, "Midtrans menolak request: "+err.Error())
		return
	}

	if err := h.orders.SetPaymentURL(r.Context(), store.ID, order.ID, snap.RedirectURL); err != nil {
		h.logger.Error("save payment url", "err", err)
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "order.payment_link_generated",
		EntityType: "order",
		EntityID:   order.ID.String(),
		Summary:    "Buat link pembayaran Midtrans untuk #" + order.OrderNumber,
		Metadata: map[string]any{
			"order_number": order.OrderNumber,
			"is_sandbox":   gateway.IsSandbox,
		},
	})

	response.JSON(w, http.StatusOK, map[string]any{
		"payment_url": snap.RedirectURL,
		"token":       snap.Token,
	})
}
