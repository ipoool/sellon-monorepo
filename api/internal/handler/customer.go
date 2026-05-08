package handler

import (
	"encoding/csv"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type CustomerHandler struct {
	customers *repository.CustomerRepo
	stores    *repository.StoreRepo
	logger    *slog.Logger
}

func NewCustomerHandler(customers *repository.CustomerRepo, stores *repository.StoreRepo, logger *slog.Logger) *CustomerHandler {
	return &CustomerHandler{customers: customers, stores: stores, logger: logger}
}

type customerDTO struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	WhatsAppNumber  string  `json:"whatsapp_number"`
	Email           string  `json:"email"`
	City            string  `json:"city"`
	Province        string  `json:"province"`
	TotalOrders     int     `json:"total_orders"`
	TotalSpentCents int64   `json:"total_spent_cents"`
	LastOrderAt     *string `json:"last_order_at"`
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
		var lastStr *string
		if c.LastOrderAt != nil {
			s := c.LastOrderAt.Format("2006-01-02T15:04:05Z07:00")
			lastStr = &s
		}
		out = append(out, customerDTO{
			ID: c.ID.String(), Name: c.Name, WhatsAppNumber: c.WhatsAppNumber,
			Email: c.Email, City: c.City, Province: c.Province,
			TotalOrders: c.TotalOrders, TotalSpentCents: c.TotalSpentCents,
			LastOrderAt: lastStr,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"customers": out})
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
