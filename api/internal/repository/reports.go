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
}

func (r *ReportsRepo) Headline(ctx context.Context, storeID uuid.UUID, since, until time.Time) (*Headline, error) {
	var h Headline
	// Cancelled orders are excluded from revenue + paid_orders even when
	// payment_status = 'paid' — sellers who cancel after payment have
	// almost always refunded out of band, so counting that money would
	// overstate revenue (BUG-012).
	err := r.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) AS orders_total,
		    COUNT(*) FILTER (WHERE status = 'cancelled') AS orders_cancelled,
		    COALESCE(SUM(total_cents) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS revenue_cents,
		    COUNT(*) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled') AS paid_orders
		FROM orders
		WHERE store_id = $1 AND created_at >= $2 AND created_at < $3
	`, storeID, since, until).Scan(&h.OrdersTotal, &h.OrdersCancelled, &h.RevenueCents, &h.PaidOrders)
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
func (r *ReportsRepo) SalesByDay(ctx context.Context, storeID uuid.UUID, since, until time.Time) ([]SalesBucket, error) {
	rows, err := r.pool.Query(ctx, `
		WITH days AS (
		    SELECT generate_series(
		        date_trunc('day', $2::timestamptz),
		        date_trunc('day', $3::timestamptz - interval '1 second'),
		        interval '1 day'
		    ) AS d
		)
		SELECT d.d::date AS bucket,
		       COUNT(o.id) AS orders,
		       COALESCE(SUM(o.total_cents) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0) AS revenue
		FROM days d
		LEFT JOIN orders o
		    ON o.store_id = $1
		   AND date_trunc('day', o.created_at) = d.d
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

// SalesByWeek aggregates revenue and orders per calendar week (Mon–Sun, UTC).
// Returns ~12 weeks for a 90-day window.
func (r *ReportsRepo) SalesByWeek(ctx context.Context, storeID uuid.UUID, since, until time.Time) ([]SalesWeekBucket, error) {
	rows, err := r.pool.Query(ctx, `
		WITH weeks AS (
		    SELECT generate_series(
		        date_trunc('week', $2::timestamptz),
		        date_trunc('week', $3::timestamptz - interval '1 second'),
		        interval '1 week'
		    ) AS w
		)
		SELECT w.w AS week_start,
		       w.w + interval '6 days' AS week_end,
		       COUNT(o.id) AS orders,
		       COALESCE(SUM(o.total_cents) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0) AS revenue
		FROM weeks w
		LEFT JOIN orders o
		    ON o.store_id = $1
		   AND date_trunc('week', o.created_at) = w.w
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

// SalesByMonth aggregates revenue and orders per calendar month (UTC).
// Returns ~12 months.
func (r *ReportsRepo) SalesByMonth(ctx context.Context, storeID uuid.UUID, since, until time.Time) ([]SalesMonthBucket, error) {
	rows, err := r.pool.Query(ctx, `
		WITH months AS (
		    SELECT generate_series(
		        date_trunc('month', $2::timestamptz),
		        date_trunc('month', $3::timestamptz - interval '1 second'),
		        interval '1 month'
		    ) AS m
		)
		SELECT m.m AS month_start,
		       COUNT(o.id) AS orders,
		       COALESCE(SUM(o.total_cents) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0) AS revenue
		FROM months m
		LEFT JOIN orders o
		    ON o.store_id = $1
		   AND date_trunc('month', o.created_at) = m.m
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
	rows, err := r.pool.Query(ctx, `
		SELECT oi.product_id, oi.product_name,
		       SUM(oi.quantity)::int AS qty,
		       SUM(oi.subtotal_cents)::bigint AS revenue
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE o.store_id = $1
		  AND o.created_at >= $2 AND o.created_at < $3
		  AND o.status <> 'cancelled'
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
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.name, c.whatsapp_number,
		       COUNT(o.id)::int AS order_count,
		       COALESCE(SUM(o.total_cents) FILTER (WHERE o.payment_status = 'paid'), 0)::bigint AS spent
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		WHERE o.store_id = $1
		  AND o.created_at >= $2 AND o.created_at < $3
		  AND o.status = 'completed'
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
