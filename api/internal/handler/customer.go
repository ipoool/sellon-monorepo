package handler

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type CustomerHandler struct {
	customers *repository.CustomerRepo
	orders    *repository.OrderRepo
	stores    *repository.StoreRepo
	logger    *slog.Logger
}

func NewCustomerHandler(customers *repository.CustomerRepo, orders *repository.OrderRepo, stores *repository.StoreRepo, logger *slog.Logger) *CustomerHandler {
	return &CustomerHandler{customers: customers, orders: orders, stores: stores, logger: logger}
}

type customerDTO struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	WhatsAppNumber  string  `json:"whatsapp_number"`
	Email           string  `json:"email"`
	City            string  `json:"city"`
	Province        string  `json:"province"`
	Address         string  `json:"address"`
	PostalCode      string  `json:"postal_code"`
	Notes           string  `json:"notes"`
	IsBlacklisted   bool    `json:"is_blacklisted"`
	TotalOrders     int     `json:"total_orders"`
	TotalSpentCents int64   `json:"total_spent_cents"`
	LastOrderAt     *string `json:"last_order_at"`
	CreatedAt       string  `json:"created_at"`
}

func toCustomerDTO(c repository.Customer) customerDTO {
	var lastStr *string
	if c.LastOrderAt != nil {
		s := c.LastOrderAt.Format("2006-01-02T15:04:05Z07:00")
		lastStr = &s
	}
	return customerDTO{
		ID: c.ID.String(), Name: c.Name, WhatsAppNumber: c.WhatsAppNumber,
		Email: c.Email, City: c.City, Province: c.Province,
		Address: c.Address, PostalCode: c.PostalCode,
		Notes: c.Notes, IsBlacklisted: c.IsBlacklisted,
		TotalOrders: c.TotalOrders, TotalSpentCents: c.TotalSpentCents,
		LastOrderAt: lastStr,
		CreatedAt:   c.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// GET /api/v1/customers
func (h *CustomerHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"customers": []customerDTO{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	rows, err := h.customers.ListByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("list customers", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]customerDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, toCustomerDTO(c))
	}
	response.JSON(w, http.StatusOK, map[string]any{"customers": out})
}

// GET /api/v1/customers/{id}
func (h *CustomerHandler) Get(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	c, err := h.customers.FindByID(r.Context(), store.ID, id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "pelanggan tidak ditemukan")
		return
	}

	// Recent orders for this customer (lightweight summary).
	hist, err := h.orders.ListByCustomer(r.Context(), store.ID, c.ID, 25)
	if err != nil {
		h.logger.Error("list customer orders", "err", err)
		hist = nil
	}
	ordersOut := make([]map[string]any, 0, len(hist))
	for _, o := range hist {
		ordersOut = append(ordersOut, map[string]any{
			"id":             o.ID.String(),
			"order_number":   o.OrderNumber,
			"status":         o.Status,
			"payment_status": o.PaymentStatus,
			"total_cents":    o.TotalCents,
			"created_at":     o.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"customer": toCustomerDTO(*c),
		"orders":   ordersOut,
	})
}

type updateCustomerReq struct {
	Notes         string `json:"notes"`
	IsBlacklisted bool   `json:"is_blacklisted"`
}

// PUT /api/v1/customers/{id}
func (h *CustomerHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	var req updateCustomerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(req.Notes) > 2000 {
		response.Error(w, http.StatusBadRequest, "catatan terlalu panjang (maks 2000 karakter)")
		return
	}
	if err := h.customers.UpdateProfile(r.Context(), store.ID, id, req.Notes, req.IsBlacklisted); err != nil {
		h.logger.Error("update customer", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	c, err := h.customers.FindByID(r.Context(), store.ID, id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "pelanggan tidak ditemukan")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"customer": toCustomerDTO(*c)})
}

// GET /api/v1/customers/export — returns CSV download
func (h *CustomerHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	rows, err := h.customers.ListByStore(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="pelanggan-`+time.Now().Format("2006-01-02")+`.csv"`)
	cw := csv.NewWriter(w)
	defer cw.Flush()

	_ = cw.Write([]string{"Nama", "WhatsApp", "Email", "Kota", "Provinsi", "Total Order", "Total Belanja (Rp)", "Terakhir Order"})
	for _, c := range rows {
		last := ""
		if c.LastOrderAt != nil {
			last = c.LastOrderAt.Format("2006-01-02")
		}
		_ = cw.Write([]string{
			c.Name, c.WhatsAppNumber, c.Email, c.City, c.Province,
			strconv.Itoa(c.TotalOrders),
			strconv.FormatInt(c.TotalSpentCents/100, 10),
			last,
		})
	}
}

func (h *CustomerHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}
