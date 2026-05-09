package handler

import (
	"encoding/csv"
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
	logger    *slog.Logger
}

func NewOrderHandler(orders *repository.OrderRepo, stores *repository.StoreRepo, gateways *repository.PaymentRepo, enc *auth.AESEncryptor, midtrans *payments.MidtransClient, logger *slog.Logger) *OrderHandler {
	return &OrderHandler{orders: orders, stores: stores, gateways: gateways, encryptor: enc, midtrans: midtrans, logger: logger}
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
	ID             string `json:"id"`
	ProductName    string `json:"product_name"`
	VariantName    string `json:"variant_name"`
	UnitPriceCents int64  `json:"unit_price_cents"`
	Quantity       int    `json:"quantity"`
	SubtotalCents  int64  `json:"subtotal_cents"`
}

type orderDetailDTO struct {
	ID                 string         `json:"id"`
	OrderNumber        string         `json:"order_number"`
	Status             string         `json:"status"`
	PaymentStatus      string         `json:"payment_status"`
	PaymentMethod      string         `json:"payment_method"`
	SubtotalCents      int64          `json:"subtotal_cents"`
	ShippingCents      int64          `json:"shipping_cents"`
	DiscountCents      int64          `json:"discount_cents"`
	PromoCode          string         `json:"promo_code"`
	TotalCents         int64          `json:"total_cents"`
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
	rows, err := h.orders.List(r.Context(), repository.ListOrdersFilter{
		StoreID:       store.ID,
		Search:        strings.TrimSpace(q.Get("q")),
		Status:        q.Get("status"),
		PaymentStatus: q.Get("payment_status"),
		Limit:         200,
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
	response.JSON(w, http.StatusOK, map[string]any{"orders": out})
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
	rows, err := h.orders.List(r.Context(), repository.ListOrdersFilter{
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
	itemsDTO := make([]orderItemDTO, 0, len(items))
	for _, it := range items {
		itemsDTO = append(itemsDTO, orderItemDTO{
			ID: it.ID.String(), ProductName: it.ProductName, VariantName: it.VariantName,
			UnitPriceCents: it.UnitPriceCents, Quantity: it.Quantity, SubtotalCents: it.SubtotalCents,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"order": orderDetailToDTO(o, itemsDTO)})
}

func orderDetailToDTO(o *repository.Order, items []orderItemDTO) orderDetailDTO {
	var paid, shipped, completed, cancelled *string
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
	return orderDetailDTO{
		ID: o.ID.String(), OrderNumber: o.OrderNumber,
		Status: o.Status, PaymentStatus: o.PaymentStatus, PaymentMethod: o.PaymentMethod,
		SubtotalCents: o.SubtotalCents, ShippingCents: o.ShippingCents,
		DiscountCents: o.DiscountCents, PromoCode: o.PromoCode,
		TotalCents: o.TotalCents,
		Courier: o.Courier, CourierService: o.CourierService, TrackingNumber: o.TrackingNumber,
		CustomerName: o.CustomerName, CustomerWhatsApp: o.CustomerWhatsApp,
		CustomerAddress: o.CustomerAddress, CustomerCity: o.CustomerCity,
		Notes: o.Notes, SellerNotes: o.SellerNotes, PaymentURL: o.PaymentURL,
		PaidAt: paid, ShippedAt: shipped, CompletedAt: completed, CancelledAt: cancelled,
		CancellationReason: o.CancellationReason,
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
	default:
		response.Error(w, http.StatusBadRequest, "action tidak dikenal")
		return
	}

	if errors.Is(actionErr, repository.ErrInvalidTransition) {
		response.Error(w, http.StatusBadRequest, "transisi status tidak valid untuk pesanan ini")
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
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"order": orderDetailToDTO(o, itemsDTO)})
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
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *OrderHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
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

	response.JSON(w, http.StatusOK, map[string]any{
		"payment_url": snap.RedirectURL,
		"token":       snap.Token,
	})
}
