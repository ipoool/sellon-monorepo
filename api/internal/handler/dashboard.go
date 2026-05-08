package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type DashboardHandler struct {
	stores    *repository.StoreRepo
	products  *repository.ProductRepo
	orders    *repository.OrderRepo
	customers *repository.CustomerRepo
	logger    *slog.Logger
}

func NewDashboardHandler(s *repository.StoreRepo, p *repository.ProductRepo, o *repository.OrderRepo, c *repository.CustomerRepo, logger *slog.Logger) *DashboardHandler {
	return &DashboardHandler{stores: s, products: p, orders: o, customers: c, logger: logger}
}

type dashboardStatsDTO struct {
	HasStore           bool  `json:"has_store"`
	OrdersTodayCount   int   `json:"orders_today_count"`
	RevenueMonthCents  int64 `json:"revenue_month_cents"`
	ProductsActive     int   `json:"products_active"`
	ProductsLowStock   int   `json:"products_low_stock"`
	CustomersTotal     int   `json:"customers_total"`
}

// GET /api/v1/dashboard/stats
func (h *DashboardHandler) Stats(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())

	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, dashboardStatsDTO{HasStore: false})
		return
	}
	if err != nil {
		h.logger.Error("dashboard stats: find store", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := dashboardStatsDTO{HasStore: true}

	if today, monthRev, err := h.orders.StatsForStore(r.Context(), store.ID); err == nil {
		out.OrdersTodayCount = today
		out.RevenueMonthCents = monthRev
	}
	if statusCounts, err := h.products.CountByStatus(r.Context(), store.ID); err == nil {
		out.ProductsActive = statusCounts["active"]
	}
	if lowStock, err := h.products.CountLowStock(r.Context(), store.ID); err == nil {
		out.ProductsLowStock = lowStock
	}
	if customerCount, err := h.customers.CountByStore(r.Context(), store.ID); err == nil {
		out.CustomersTotal = customerCount
	}

	response.JSON(w, http.StatusOK, out)
}
