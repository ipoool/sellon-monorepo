package handler

import (
	"errors"
	"log/slog"
	"net/http"

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

type orderDTO struct {
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

// GET /api/v1/orders
func (h *OrderHandler) List(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"orders": []orderDTO{}})
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

	out := make([]orderDTO, 0, len(rows))
	for _, o := range rows {
		out = append(out, orderDTO{
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
