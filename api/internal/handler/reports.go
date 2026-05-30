package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"strconv"
	"time"

	excelize "github.com/xuri/excelize/v2"

	"github.com/sellon/sellon/api/internal/ai"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

var idMonths = [13]string{"", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}

type ReportsHandler struct {
	stores    *repository.StoreRepo
	reports   *repository.ReportsRepo
	orders    *repository.OrderRepo
	subs      *repository.SubscriptionRepo
	anthropic *ai.AnthropicClient
	logger    *slog.Logger
}

func NewReportsHandler(
	stores *repository.StoreRepo,
	reports *repository.ReportsRepo,
	orders *repository.OrderRepo,
	subs *repository.SubscriptionRepo,
	anthropic *ai.AnthropicClient,
	logger *slog.Logger,
) *ReportsHandler {
	return &ReportsHandler{stores: stores, reports: reports, orders: orders, subs: subs, anthropic: anthropic, logger: logger}
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

// GET /api/v1/reports/overview?view=daily|weekly|monthly
//
// view=daily   → 7 days, one bar per day
// view=weekly  → 12 weeks, one bar per week
// view=monthly → 12 months, one bar per month
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

	view := r.URL.Query().Get("view")
	if view != "weekly" && view != "monthly" {
		view = "daily"
	}

	until := time.Now()
	var since time.Time
	var days int
	switch view {
	case "weekly":
		since = until.AddDate(0, 0, -84) // ~12 weeks
		days = 84
	case "monthly":
		since = until.AddDate(-1, 0, 0) // 12 months
		days = 365
	default:
		since = until.AddDate(0, 0, -7)
		days = 7
	}

	// Explicit date range (merged Laporan & Analytics page) overrides the
	// view-based window. from/to are inclusive WIB dates "YYYY-MM-DD".
	if fStr := strings.TrimSpace(r.URL.Query().Get("from")); fStr != "" {
		if tStr := strings.TrimSpace(r.URL.Query().Get("to")); tStr != "" {
			fT, e1 := time.ParseInLocation("2006-01-02", fStr, wib)
			tT, e2 := time.ParseInLocation("2006-01-02", tStr, wib)
			if e1 == nil && e2 == nil {
				since = fT
				until = tT.AddDate(0, 0, 1) // exclusive end
				view = "daily"
				days = int(tT.Sub(fT).Hours()/24) + 1
			}
		}
	}

	headline, err := h.reports.Headline(r.Context(), store.ID, since, until)
	if err != nil {
		h.logger.Error("reports headline", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Build sales buckets with display labels.
	var salesOut []map[string]any
	switch view {
	case "weekly":
		buckets, err := h.reports.SalesByWeek(r.Context(), store.ID, since, until)
		if err != nil {
			h.logger.Error("reports sales by week", "err", err)
			response.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		for _, b := range buckets {
			var label string
			startM := b.WeekStart.Month()
			endM := b.WeekEnd.Month()
			if startM == endM {
				label = fmt.Sprintf("%d-%d %s", b.WeekStart.Day(), b.WeekEnd.Day(), idMonths[startM])
			} else {
				label = fmt.Sprintf("%d %s – %d %s", b.WeekStart.Day(), idMonths[startM], b.WeekEnd.Day(), idMonths[endM])
			}
			salesOut = append(salesOut, map[string]any{
				"date":          b.WeekStart.Format("2006-01-02"),
				"label":         label,
				"orders":        b.Orders,
				"revenue_cents": b.RevenueCents,
			})
		}
	case "monthly":
		buckets, err := h.reports.SalesByMonth(r.Context(), store.ID, since, until)
		if err != nil {
			h.logger.Error("reports sales by month", "err", err)
			response.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		for _, b := range buckets {
			label := fmt.Sprintf("%s %d", idMonths[b.Month.Month()], b.Month.Year())
			salesOut = append(salesOut, map[string]any{
				"date":          b.Month.Format("2006-01-02"),
				"label":         label,
				"orders":        b.Orders,
				"revenue_cents": b.RevenueCents,
			})
		}
	default:
		daily, err := h.reports.SalesByDay(r.Context(), store.ID, since, until)
		if err != nil {
			h.logger.Error("reports sales by day", "err", err)
			response.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		for _, b := range daily {
			d := b.Date
			label := fmt.Sprintf("%d %s", d.Day(), idMonths[d.Month()])
			salesOut = append(salesOut, map[string]any{
				"date":          d.Format("2006-01-02"),
				"label":         label,
				"orders":        b.Orders,
				"revenue_cents": b.RevenueCents,
			})
		}
	}
	if salesOut == nil {
		salesOut = []map[string]any{}
	}

	topProducts, _ := h.reports.TopProducts(r.Context(), store.ID, since, until, 10)
	topCustomers, _ := h.reports.TopCustomers(r.Context(), store.ID, since, until, 10)
	statusBreakdown, _ := h.reports.CountByStatus(r.Context(), store.ID, since, until)
	paymentBreakdown, _ := h.reports.CountByPaymentMethod(r.Context(), store.ID, since, until)

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
		"view":      view,
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

// GET /api/v1/reports/export?view=daily|weekly|monthly
// Returns an XLSX report with multiple sheets covering the selected period.
func (h *ReportsHandler) Export(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	view := r.URL.Query().Get("view")
	if view != "weekly" && view != "monthly" {
		view = "daily"
	}
	until := time.Now()
	var since time.Time
	var periodLabel string
	switch view {
	case "weekly":
		since = until.AddDate(0, 0, -84)
		periodLabel = "12 Minggu Terakhir"
	case "monthly":
		since = until.AddDate(-1, 0, 0)
		periodLabel = "12 Bulan Terakhir"
	default:
		since = until.AddDate(0, 0, -7)
		periodLabel = "7 Hari Terakhir"
	}

	// Explicit date range overrides the view window (merged page export).
	if fStr := strings.TrimSpace(r.URL.Query().Get("from")); fStr != "" {
		if tStr := strings.TrimSpace(r.URL.Query().Get("to")); tStr != "" {
			fT, e1 := time.ParseInLocation("2006-01-02", fStr, wib)
			tT, e2 := time.ParseInLocation("2006-01-02", tStr, wib)
			if e1 == nil && e2 == nil {
				since = fT
				until = tT.AddDate(0, 0, 1)
				periodLabel = fStr + " s/d " + tStr
			}
		}
	}

	headline, _ := h.reports.Headline(r.Context(), store.ID, since, until)
	topProducts, _ := h.reports.TopProducts(r.Context(), store.ID, since, until, 20)
	topCustomers, _ := h.reports.TopCustomers(r.Context(), store.ID, since, until, 20)
	orderList, _, _ := h.orders.List(r.Context(), repository.ListOrdersFilter{
		StoreID: store.ID,
		Limit:   1000,
	})

	f := excelize.NewFile()
	defer f.Close()

	// ─── Helper ────────────────────────────────────────────────────────────
	bold, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	header, _ := f.NewStyle(&excelize.Style{
		Font:    &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:    excelize.Fill{Type: "pattern", Color: []string{"10B981"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	currency, _ := f.NewStyle(&excelize.Style{NumFmt: 44}) // accounting
	_ = bold
	_ = currency

	setRow := func(sheet string, row int, cells []any) {
		for col, val := range cells {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, val)
		}
	}
	setHeader := func(sheet string, row int, cols []string) {
		for col, h2 := range cols {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, h2)
			_ = f.SetCellStyle(sheet, cell, cell, header)
		}
	}
	rupiah := func(cents int64) string {
		v := cents / 100
		s := fmt.Sprintf("%d", v)
		n := len(s)
		out := ""
		for i, c := range s {
			if i > 0 && (n-i)%3 == 0 {
				out += "."
			}
			out += string(c)
		}
		return "Rp " + out
	}
	formatDate := func(t time.Time) string {
		return fmt.Sprintf("%d %s %d", t.Day(), idMonths[t.Month()], t.Year())
	}

	// ─── Sheet 1: Ringkasan ────────────────────────────────────────────────
	sheet1 := "Ringkasan"
	_ = f.SetSheetName("Sheet1", sheet1)
	setRow(sheet1, 1, []any{"LAPORAN PENJUALAN — " + store.Name})
	_ = f.SetCellStyle(sheet1, "A1", "A1", bold)
	setRow(sheet1, 2, []any{"Periode", periodLabel})
	setRow(sheet1, 3, []any{"Toko", store.Name})
	setRow(sheet1, 4, []any{"Digenerate", formatDate(until)})
	setRow(sheet1, 6, []any{"RINGKASAN KEUANGAN"})
	_ = f.SetCellStyle(sheet1, "A6", "A6", bold)
	if headline != nil {
		setRow(sheet1, 7, []any{"Total Revenue (Lunas)", rupiah(headline.RevenueCents)})
		setRow(sheet1, 8, []any{"Total Order", headline.OrdersTotal})
		setRow(sheet1, 9, []any{"Order Berbayar", headline.PaidOrders})
		setRow(sheet1, 10, []any{"Order Dibatalkan", headline.OrdersCancelled})
		setRow(sheet1, 11, []any{"Avg. Order Value", rupiah(headline.AOVCents)})
	}
	_ = f.SetColWidth(sheet1, "A", "A", 28)
	_ = f.SetColWidth(sheet1, "B", "B", 22)

	// ─── Sheet 2: Detail Pesanan ───────────────────────────────────────────
	sheet2 := "Detail Pesanan"
	_, _ = f.NewSheet(sheet2)
	cols2 := []string{"No. Pesanan", "Tanggal", "Nama Pembeli", "WhatsApp", "Kota", "Kurir", "Metode Bayar", "Subtotal", "Ongkir", "Diskon", "Total", "Status Pesanan", "Status Bayar", "Catatan Pembeli"}
	setHeader(sheet2, 1, cols2)
	for i, o := range orderList {
		if o.CreatedAt.Before(since) {
			continue
		}
		setRow(sheet2, i+2, []any{
			o.OrderNumber,
			formatDate(o.CreatedAt),
			o.CustomerName,
			o.CustomerWhatsApp,
			o.CustomerCity,
			o.Courier,
			o.PaymentMethod,
			rupiah(o.SubtotalCents),
			rupiah(o.ShippingCents),
			rupiah(o.DiscountCents),
			rupiah(o.TotalCents),
			o.Status,
			o.PaymentStatus,
			o.Notes,
		})
	}
	widths2 := []float64{18, 14, 22, 16, 14, 14, 18, 14, 12, 12, 14, 16, 14, 30}
	for i, w2 := range widths2 {
		col, _ := excelize.ColumnNumberToName(i + 1)
		_ = f.SetColWidth(sheet2, col, col, w2)
	}

	// ─── Sheet 3: Produk Terlaris ──────────────────────────────────────────
	sheet3 := "Produk Terlaris"
	_, _ = f.NewSheet(sheet3)
	setHeader(sheet3, 1, []string{"Ranking", "Nama Produk", "Qty Terjual", "Revenue"})
	for i, p := range topProducts {
		setRow(sheet3, i+2, []any{i + 1, p.ProductName, p.QtySold, rupiah(p.RevenueCents)})
	}
	_ = f.SetColWidth(sheet3, "A", "A", 10)
	_ = f.SetColWidth(sheet3, "B", "B", 40)
	_ = f.SetColWidth(sheet3, "C", "C", 14)
	_ = f.SetColWidth(sheet3, "D", "D", 18)

	// ─── Sheet 4: Pelanggan Top ────────────────────────────────────────────
	sheet4 := "Pelanggan Top"
	_, _ = f.NewSheet(sheet4)
	setHeader(sheet4, 1, []string{"Ranking", "Nama Pelanggan", "WhatsApp", "Total Order (Selesai)", "Total Belanja"})
	for i, c := range topCustomers {
		setRow(sheet4, i+2, []any{i + 1, c.Name, c.WhatsApp, c.Orders, rupiah(c.TotalSpentCnt)})
	}
	_ = f.SetColWidth(sheet4, "A", "A", 10)
	_ = f.SetColWidth(sheet4, "B", "B", 28)
	_ = f.SetColWidth(sheet4, "C", "C", 18)
	_ = f.SetColWidth(sheet4, "D", "D", 22)
	_ = f.SetColWidth(sheet4, "E", "E", 18)

	// ─── Write response ────────────────────────────────────────────────────
	filename := fmt.Sprintf("laporan-%s-%s.xlsx",
		store.Slug,
		until.Format("2006-01-02"),
	)
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	if err := f.Write(w); err != nil {
		h.logger.Error("export xlsx write", "err", err)
	}
}

const aiInsightSystemPrompt = `Kamu adalah konsultan bisnis UMKM Indonesia yang ahli menganalisa data penjualan online.
Berikan insight yang actionable, ringkas, dan langsung to the point dalam Bahasa Indonesia.
Gaya penulisan: seperti mentor bisnis yang supportif — tidak menggurui, fokus pada langkah konkret yang bisa dilakukan hari ini.
Hindari jargon berat. Gunakan contoh nyata kalau ada.
Balas HANYA dengan JSON berikut (tanpa markdown, tanpa penjelasan tambahan):
{"ringkasan":"...","produk_insight":"...","pelanggan_insight":"...","rekomendasi":["...","...","...","..."]}`

// POST /api/v1/reports/ai-insight
// Generates an AI-powered business insight for the seller's store using
// Claude Haiku. Results are cached in Postgres for 24 hours.
func (h *ReportsHandler) AiInsight(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Plan gate — Pro / Bisnis only.
	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if sub.Plan == "free" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{
			"error": "plan_required",
			"plan":  "pro",
		})
		return
	}

	// Data age gate — need ≥ 14 days of order history.
	oldest, err := h.reports.OldestOrderAt(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	const minDays = 14
	if oldest == nil {
		response.JSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":                  "insufficient_data",
			"days_since_first_order": 0,
			"min_days_required":      minDays,
		})
		return
	}
	daysSince := int(time.Since(*oldest).Hours() / 24)
	if daysSince < minDays {
		response.JSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":                  "insufficient_data",
			"days_since_first_order": daysSince,
			"min_days_required":      minDays,
		})
		return
	}

	// Cache hit — return immediately.
	cached, generatedAt, _ := h.reports.GetCachedInsight(r.Context(), store.ID)
	if cached != "" {
		var insight map[string]any
		if err := json.Unmarshal([]byte(cached), &insight); err == nil {
			insight["cached_at"] = generatedAt.Format(time.RFC3339)
			response.JSON(w, http.StatusOK, insight)
			return
		}
	}

	// Collect 90-day data for the prompt.
	until := time.Now()
	since90 := until.AddDate(0, 0, -90)

	headline, _ := h.reports.Headline(r.Context(), store.ID, since90, until)
	topProducts, _ := h.reports.TopProducts(r.Context(), store.ID, since90, until, 10)
	topCustomers, _ := h.reports.TopCustomers(r.Context(), store.ID, since90, until, 10)
	statusMap, _ := h.reports.CountByStatus(r.Context(), store.ID, since90, until)
	payMap, _ := h.reports.CountByPaymentMethod(r.Context(), store.ID, since90, until)

	// Build prompt.
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Data toko \"%s\" (90 hari terakhir):\n\n", store.Name))

	if headline != nil {
		sb.WriteString(fmt.Sprintf(
			"KEUANGAN: revenue Rp %d | AOV Rp %d | %d order masuk | %d selesai | %d dibatalkan\n\n",
			headline.RevenueCents/100, headline.AOVCents/100,
			headline.OrdersTotal, headline.PaidOrders, headline.OrdersCancelled,
		))
	}

	if len(topProducts) > 0 {
		sb.WriteString("PRODUK TERLARIS (qty):\n")
		for i, p := range topProducts {
			sb.WriteString(fmt.Sprintf("%d. %s — %d terjual, Rp %d revenue\n",
				i+1, p.ProductName, p.QtySold, p.RevenueCents/100))
		}
		sb.WriteString("\n")
	}

	if len(topCustomers) > 0 {
		sb.WriteString("PELANGGAN TERBAIK (order selesai):\n")
		for i, c := range topCustomers {
			sb.WriteString(fmt.Sprintf("%d. %s — %d order, total Rp %d\n",
				i+1, c.Name, c.Orders, c.TotalSpentCnt/100))
		}
		sb.WriteString("\n")
	}

	if len(statusMap) > 0 {
		sb.WriteString("STATUS ORDER: ")
		for k, v := range statusMap {
			sb.WriteString(fmt.Sprintf("%s:%d ", k, v))
		}
		sb.WriteString("\n")
	}

	if len(payMap) > 0 {
		sb.WriteString("METODE BAYAR: ")
		for k, v := range payMap {
			sb.WriteString(fmt.Sprintf("%s:%d ", k, v))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("\nAnalisa perilaku pelanggan, insight produk, dan berikan 4 rekomendasi konkret yang bisa dilakukan minggu ini.")

	// Call Claude Haiku.
	if !h.anthropic.Configured() {
		response.JSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "ai_not_configured",
			"message": "Fitur AI Insight belum dikonfigurasi. Hubungi admin.",
		})
		return
	}

	ctx := r.Context()
	raw, err := h.anthropic.Complete(ctx, "claude-haiku-4-5-20251001", aiInsightSystemPrompt, sb.String(), 2048)
	if err != nil {
		h.logger.Error("ai insight: claude call failed", "err", err, "store", store.ID)
		response.JSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "ai_error",
			"message": "Analisa AI sedang tidak tersedia. Coba lagi dalam beberapa menit.",
		})
		return
	}

	// Strip markdown fences if present.
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	if idx := strings.LastIndex(raw, "```"); idx > 0 {
		raw = raw[:idx]
	}
	raw = strings.TrimSpace(raw)

	// Validate JSON.
	var insight map[string]any
	if err := json.Unmarshal([]byte(raw), &insight); err != nil {
		h.logger.Error("ai insight: invalid json from claude", "raw", raw[:min(200, len(raw))], "err", err)
		response.JSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "ai_error",
			"message": "Analisa tidak valid. Coba lagi.",
		})
		return
	}

	// Cache result.
	if cacheErr := h.reports.SetCachedInsight(ctx, store.ID, raw); cacheErr != nil {
		h.logger.Warn("ai insight: cache write failed", "err", cacheErr)
	}

	insight["cached_at"] = "" // fresh result has no cached_at
	response.JSON(w, http.StatusOK, insight)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
