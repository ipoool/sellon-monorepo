package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReportsRepo struct {
	pool *pgxpool.Pool
}

func NewReportsRepo(pool *pgxpool.Pool) *ReportsRepo {
	return &ReportsRepo{pool: pool}
}

// All reports below use a closed-open window: [since, until). The handler
// passes `since = now - days * 24h` and `until = now`.

type Headline struct {
	OrdersTotal     int
	OrdersCancelled int
	RevenueCents    int64 // paid orders only
	PaidOrders      int
	AOVCents        int64 // average order value of paid orders
	TaxCents        int64 // total PPN/tax collected on paid, non-cancelled orders
}

// One definition of "this order counts as revenue", shared by every query in
// this file. Laporan renders these side by side on one page, so any drift
// between them shows the seller two different answers to the same question —
// which is exactly what happened: the top-products panel had no paid filter at
// all and the top-customers panel required 'completed', while the headline and
// the charts used the rule below.
//
// Cancelled orders are excluded even when paid: a seller who cancels after
// payment has almost always refunded out of band, so counting that money would
// overstate revenue (BUG-012).
const revenueFilter = "o.payment_status = 'paid' AND o.status <> 'cancelled'"

// netRevenue is the amount such an order actually earned. A PARTIAL refund
// leaves payment_status='paid' (the order is still a sale, just a smaller
// one), so without subtracting what went back the seller's revenue includes
// money they have already returned. Full refunds flip to 'refunded' and are
// already excluded by revenueFilter.
const netRevenue = "(o.total_cents - COALESCE(o.refund_amount_cents, 0))"

func (r *ReportsRepo) Headline(ctx context.Context, storeID uuid.UUID, since, until time.Time) (*Headline, error) {
	var h Headline
	// Cancelled orders are excluded from revenue + paid_orders even when
	// payment_status = 'paid' — sellers who cancel after payment have
	// almost always refunded out of band, so counting that money would
	// overstate revenue (BUG-012).
	err := r.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) AS orders_total,
		    COUNT(*) FILTER (WHERE o.status = 'cancelled') AS orders_cancelled,
		    COALESCE(SUM(`+netRevenue+`) FILTER (WHERE `+revenueFilter+`), 0) AS revenue_cents,
		    COUNT(*) FILTER (WHERE `+revenueFilter+`) AS paid_orders,
		    COALESCE(SUM(o.tax_cents) FILTER (WHERE `+revenueFilter+`), 0) AS tax_cents
		FROM orders o
		WHERE o.store_id = $1 AND o.created_at >= $2 AND o.created_at < $3
	`, storeID, since, until).Scan(&h.OrdersTotal, &h.OrdersCancelled, &h.RevenueCents, &h.PaidOrders, &h.TaxCents)
	if err != nil {
		return nil, err
	}
	if h.PaidOrders > 0 {
		h.AOVCents = h.RevenueCents / int64(h.PaidOrders)
	}
	return &h, nil
}

type SalesBucket struct {
	Date         time.Time
	Orders       int
	RevenueCents int64
}

// SalesByDay returns one row per day in the window (gaps filled with zeros)
// using generate_series so the chart renders contiguous bars.
//
// Buckets are WIB calendar days: the handler parses from/to in WIB, so both
// the series and the join key convert created_at to Asia/Jakarta wall-clock
// before truncating (the DB session TZ is UTC — truncating there would shift
// evening orders into the next day and misalign the series with the window).
func (r *ReportsRepo) SalesByDay(ctx context.Context, storeID uuid.UUID, since, until time.Time) ([]SalesBucket, error) {
	rows, err := r.pool.Query(ctx, `
		WITH days AS (
		    SELECT generate_series(
		        date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Jakarta'),
		        date_trunc('day', ($3::timestamptz - interval '1 second') AT TIME ZONE 'Asia/Jakarta'),
		        interval '1 day'
		    ) AS d
		)
		SELECT d.d::date AS bucket,
		       COUNT(o.id) AS orders,
		       COALESCE(SUM(`+netRevenue+`) FILTER (WHERE `+revenueFilter+`), 0) AS revenue
		FROM days d
		LEFT JOIN orders o
		    ON o.store_id = $1
		   AND date_trunc('day', o.created_at AT TIME ZONE 'Asia/Jakarta') = d.d
		   AND o.created_at >= $2 AND o.created_at < $3
		GROUP BY d.d
		ORDER BY d.d ASC
	`, storeID, since, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SalesBucket
	for rows.Next() {
		var b SalesBucket
		if err := rows.Scan(&b.Date, &b.Orders, &b.RevenueCents); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

type SalesWeekBucket struct {
	WeekStart    time.Time
	WeekEnd      time.Time
	Orders       int
	RevenueCents int64
}

// SalesByWeek aggregates revenue and orders per calendar week (Mon–Sun, WIB).
// Returns ~12 weeks for a 90-day window. Week boundaries are computed on the
// Asia/Jakarta wall-clock (see SalesByDay).
func (r *ReportsRepo) SalesByWeek(ctx context.Context, storeID uuid.UUID, since, until time.Time) ([]SalesWeekBucket, error) {
	rows, err := r.pool.Query(ctx, `
		WITH weeks AS (
		    SELECT generate_series(
		        date_trunc('week', $2::timestamptz AT TIME ZONE 'Asia/Jakarta'),
		        date_trunc('week', ($3::timestamptz - interval '1 second') AT TIME ZONE 'Asia/Jakarta'),
		        interval '1 week'
		    ) AS w
		)
		SELECT w.w AS week_start,
		       w.w + interval '6 days' AS week_end,
		       COUNT(o.id) AS orders,
		       COALESCE(SUM(`+netRevenue+`) FILTER (WHERE `+revenueFilter+`), 0) AS revenue
		FROM weeks w
		LEFT JOIN orders o
		    ON o.store_id = $1
		   AND date_trunc('week', o.created_at AT TIME ZONE 'Asia/Jakarta') = w.w
		   AND o.created_at >= $2 AND o.created_at < $3
		GROUP BY w.w
		ORDER BY w.w ASC
	`, storeID, since, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SalesWeekBucket
	for rows.Next() {
		var b SalesWeekBucket
		if err := rows.Scan(&b.WeekStart, &b.WeekEnd, &b.Orders, &b.RevenueCents); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

type SalesMonthBucket struct {
	Month        time.Time
	Orders       int
	RevenueCents int64
}

// SalesByMonth aggregates revenue and orders per calendar month (WIB).
// Returns ~12 months. Month boundaries are computed on the Asia/Jakarta
// wall-clock (see SalesByDay).
func (r *ReportsRepo) SalesByMonth(ctx context.Context, storeID uuid.UUID, since, until time.Time) ([]SalesMonthBucket, error) {
	rows, err := r.pool.Query(ctx, `
		WITH months AS (
		    SELECT generate_series(
		        date_trunc('month', $2::timestamptz AT TIME ZONE 'Asia/Jakarta'),
		        date_trunc('month', ($3::timestamptz - interval '1 second') AT TIME ZONE 'Asia/Jakarta'),
		        interval '1 month'
		    ) AS m
		)
		SELECT m.m AS month_start,
		       COUNT(o.id) AS orders,
		       COALESCE(SUM(`+netRevenue+`) FILTER (WHERE `+revenueFilter+`), 0) AS revenue
		FROM months m
		LEFT JOIN orders o
		    ON o.store_id = $1
		   AND date_trunc('month', o.created_at AT TIME ZONE 'Asia/Jakarta') = m.m
		   AND o.created_at >= $2 AND o.created_at < $3
		GROUP BY m.m
		ORDER BY m.m ASC
	`, storeID, since, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SalesMonthBucket
	for rows.Next() {
		var b SalesMonthBucket
		if err := rows.Scan(&b.Month, &b.Orders, &b.RevenueCents); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

type TopProduct struct {
	ProductID    *uuid.UUID
	ProductName  string
	QtySold      int
	RevenueCents int64
}

func (r *ReportsRepo) TopProducts(ctx context.Context, storeID uuid.UUID, since, until time.Time, limit int) ([]TopProduct, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	// Same revenue rule as every other panel. Without the paid filter this
	// ranked products by orders nobody had paid for — an abandoned cart of 50
	// units outranked a real best-seller, and the money column sat next to a
	// headline computed on a stricter rule.
	//
	// Line revenue is the sum of line subtotals, so it intentionally does not
	// equal the headline total: that one also carries shipping, order-level
	// discount and tax. Partial refunds are not netted here either — a refund
	// is recorded against the order, not against a specific line.
	rows, err := r.pool.Query(ctx, `
		SELECT oi.product_id, oi.product_name,
		       SUM(oi.quantity)::int AS qty,
		       SUM(oi.subtotal_cents)::bigint AS revenue
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE o.store_id = $1
		  AND o.created_at >= $2 AND o.created_at < $3
		  AND `+revenueFilter+`
		GROUP BY oi.product_id, oi.product_name
		ORDER BY qty DESC, revenue DESC
		LIMIT $4
	`, storeID, since, until, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TopProduct
	for rows.Next() {
		var p TopProduct
		if err := rows.Scan(&p.ProductID, &p.ProductName, &p.QtySold, &p.RevenueCents); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

type TopCustomer struct {
	CustomerID    uuid.UUID
	Name          string
	WhatsApp      string
	Orders        int
	TotalSpentCnt int64
}

func (r *ReportsRepo) TopCustomers(ctx context.Context, storeID uuid.UUID, since, until time.Time, limit int) ([]TopCustomer, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	// Two bugs lived in the old WHERE clause. It required status='completed',
	// so a paid order still being packed or shipped contributed nothing —
	// a customer's spend here was lower than the same customer's contribution
	// to the headline above it. And the order COUNT had no payment filter at
	// all while the spend SUM did, so a single row could read "3 pesanan,
	// Rp 0". One rule now drives both columns.
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.name, c.whatsapp_number,
		       COUNT(o.id)::int AS order_count,
		       COALESCE(SUM(`+netRevenue+`), 0)::bigint AS spent
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		WHERE o.store_id = $1
		  AND o.created_at >= $2 AND o.created_at < $3
		  AND `+revenueFilter+`
		GROUP BY c.id, c.name, c.whatsapp_number
		ORDER BY spent DESC, order_count DESC
		LIMIT $4
	`, storeID, since, until, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TopCustomer
	for rows.Next() {
		var c TopCustomer
		if err := rows.Scan(&c.CustomerID, &c.Name, &c.WhatsApp, &c.Orders, &c.TotalSpentCnt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// CountByStatus / CountByPayment return label -> count maps. Empty map if
// no orders in the window.
func (r *ReportsRepo) CountByStatus(ctx context.Context, storeID uuid.UUID, since, until time.Time) (map[string]int, error) {
	return r.countByCol(ctx, "status", storeID, since, until)
}

func (r *ReportsRepo) CountByPaymentMethod(ctx context.Context, storeID uuid.UUID, since, until time.Time) (map[string]int, error) {
	return r.countByCol(ctx, "payment_method", storeID, since, until)
}

func (r *ReportsRepo) countByCol(ctx context.Context, col string, storeID uuid.UUID, since, until time.Time) (map[string]int, error) {
	// Validate column to avoid SQL injection — caller controls only the two
	// constants below.
	if col != "status" && col != "payment_method" {
		return nil, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+col+` AS bucket, COUNT(*)::int AS n
		FROM orders
		WHERE store_id = $1 AND created_at >= $2 AND created_at < $3
		GROUP BY bucket
		ORDER BY n DESC
	`, storeID, since, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var label string
		var n int
		if err := rows.Scan(&label, &n); err != nil {
			return nil, err
		}
		if label == "" {
			label = "—"
		}
		out[label] = n
	}
	return out, rows.Err()
}

// OldestOrderAt returns the creation timestamp of the earliest order for
// the store. Returns nil if the store has no orders yet.
func (r *ReportsRepo) OldestOrderAt(ctx context.Context, storeID uuid.UUID) (*time.Time, error) {
	var t *time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT MIN(created_at) FROM orders WHERE store_id = $1`,
		storeID,
	).Scan(&t)
	return t, err
}

// GetCachedInsight returns the cached insight JSON for the store if it
// has not yet expired. Returns ("", nil) on a cache miss.
func (r *ReportsRepo) GetCachedInsight(ctx context.Context, storeID uuid.UUID) (string, time.Time, error) {
	var json string
	var generatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT insight_json, generated_at FROM ai_insights
		 WHERE store_id = $1 AND expires_at > now()`,
		storeID,
	).Scan(&json, &generatedAt)
	if err != nil {
		return "", time.Time{}, nil // cache miss — treat as nil
	}
	return json, generatedAt, nil
}

// SetCachedInsight upserts the insight JSON for the store with a 24-hour TTL.
func (r *ReportsRepo) SetCachedInsight(ctx context.Context, storeID uuid.UUID, insightJSON string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO ai_insights (store_id, insight_json, expires_at)
		VALUES ($1, $2, now() + interval '24 hours')
		ON CONFLICT (store_id) DO UPDATE
		  SET insight_json  = EXCLUDED.insight_json,
		      generated_at  = now(),
		      expires_at    = now() + interval '24 hours'
	`, storeID, insightJSON)
	return err
}
