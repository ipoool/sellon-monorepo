package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type OrderHandler struct {
	orders *repository.OrderRepo
	stores *repository.StoreRepo
	logger *slog.Logger
}

func NewOrderHandler(orders *repository.OrderRepo, stores *repository.StoreRepo, logger *slog.Logger) *OrderHandler {
	return &OrderHandler{orders: orders, stores: stores, logger: logger}
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

// GET /api/v1/orders
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

	rows, err := h.orders.ListByStore(r.Context(), store.ID, 100)
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
		SubtotalCents: o.SubtotalCents, ShippingCents: o.ShippingCents, TotalCents: o.TotalCents,
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
