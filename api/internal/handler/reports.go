package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type ReportsHandler struct {
	stores  *repository.StoreRepo
	reports *repository.ReportsRepo
	logger  *slog.Logger
}

func NewReportsHandler(stores *repository.StoreRepo, reports *repository.ReportsRepo, logger *slog.Logger) *ReportsHandler {
	return &ReportsHandler{stores: stores, reports: reports, logger: logger}
}

// daysFromQuery clamps to 1..365, default 30.
func daysFromQuery(r *http.Request) int {
	d, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if d <= 0 {
		d = 30
	}
	if d > 365 {
		d = 365
	}
	return d
}

func (h *ReportsHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// GET /api/v1/reports/overview?days=30
//
// Returns headline stats + sales-by-day + top products + top customers +
// status breakdown + payment breakdown in one call. Buyers don't pay for
// 5 round-trips and the dashboard renders all bits together anyway.
func (h *ReportsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"has_store": false})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	days := daysFromQuery(r)
	until := time.Now()
	since := until.Add(-time.Duration(days) * 24 * time.Hour)

	headline, err := h.reports.Headline(r.Context(), store.ID, since, until)
	if err != nil {
		h.logger.Error("reports headline", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	salesByDay, err := h.reports.SalesByDay(r.Context(), store.ID, since, until)
	if err != nil {
		h.logger.Error("reports sales by day", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	topProducts, _ := h.reports.TopProducts(r.Context(), store.ID, since, until, 10)
	topCustomers, _ := h.reports.TopCustomers(r.Context(), store.ID, since, until, 10)
	statusBreakdown, _ := h.reports.CountByStatus(r.Context(), store.ID, since, until)
	paymentBreakdown, _ := h.reports.CountByPaymentMethod(r.Context(), store.ID, since, until)

	salesOut := make([]map[string]any, 0, len(salesByDay))
	for _, b := range salesByDay {
		salesOut = append(salesOut, map[string]any{
			"date":          b.Date.Format("2006-01-02"),
			"orders":        b.Orders,
			"revenue_cents": b.RevenueCents,
		})
	}

	productsOut := make([]map[string]any, 0, len(topProducts))
	for _, p := range topProducts {
		var pid string
		if p.ProductID != nil {
			pid = p.ProductID.String()
		}
		productsOut = append(productsOut, map[string]any{
			"product_id":    pid,
			"product_name":  p.ProductName,
			"qty_sold":      p.QtySold,
			"revenue_cents": p.RevenueCents,
		})
	}

	customersOut := make([]map[string]any, 0, len(topCustomers))
	for _, c := range topCustomers {
		customersOut = append(customersOut, map[string]any{
			"customer_id":       c.CustomerID.String(),
			"name":              c.Name,
			"whatsapp_number":   c.WhatsApp,
			"orders":            c.Orders,
			"total_spent_cents": c.TotalSpentCnt,
		})
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"has_store": true,
		"days":      days,
		"since":     since.Format(time.RFC3339),
		"until":     until.Format(time.RFC3339),
		"headline": map[string]any{
			"orders_total":     headline.OrdersTotal,
			"orders_cancelled": headline.OrdersCancelled,
			"revenue_cents":    headline.RevenueCents,
			"paid_orders":      headline.PaidOrders,
			"aov_cents":        headline.AOVCents,
		},
		"sales_by_day":      salesOut,
		"top_products":      productsOut,
		"top_customers":     customersOut,
		"status_breakdown":  statusBreakdown,
		"payment_breakdown": paymentBreakdown,
	})
}
