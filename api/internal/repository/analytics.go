package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Cash entries (manual income/expense ledger) ─────────────────────────────

type CashEntry struct {
	ID          uuid.UUID
	Direction   string // "in" | "out"
	Category    string
	AmountCents int64
	OccurredOn  time.Time
	Note        string
}

type CashEntryRepo struct {
	pool *pgxpool.Pool
}

func NewCashEntryRepo(pool *pgxpool.Pool) *CashEntryRepo { return &CashEntryRepo{pool: pool} }

// from/to are inclusive-start / exclusive-end date strings "YYYY-MM-DD".
func (r *CashEntryRepo) ListByStore(ctx context.Context, storeID uuid.UUID, from, to string) ([]CashEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, direction, category, amount_cents, occurred_on, note
		FROM cash_entries
		WHERE store_id = $1 AND occurred_on >= $2::date AND occurred_on < $3::date
		ORDER BY occurred_on DESC, created_at DESC
		LIMIT 500
	`, storeID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CashEntry
	for rows.Next() {
		var c CashEntry
		if err := rows.Scan(&c.ID, &c.Direction, &c.Category, &c.AmountCents, &c.OccurredOn, &c.Note); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *CashEntryRepo) Create(ctx context.Context, storeID uuid.UUID, direction, category string, amountCents int64, occurredOn, note string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `
		INSERT INTO cash_entries (store_id, direction, category, amount_cents, occurred_on, note)
		VALUES ($1, $2, $3, $4, $5::date, $6) RETURNING id
	`, storeID, direction, category, amountCents, occurredOn, note).Scan(&id)
	return id, err
}

func (r *CashEntryRepo) Delete(ctx context.Context, storeID, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cash_entries WHERE id = $1 AND store_id = $2`, id, storeID)
	return err
}

// ─── Analytics aggregation ───────────────────────────────────────────────────

type AnalyticsRepo struct {
	pool *pgxpool.Pool
}

func NewAnalyticsRepo(pool *pgxpool.Pool) *AnalyticsRepo { return &AnalyticsRepo{pool: pool} }

// GetCachedSummary returns a previously generated AI summary whose input data
// fingerprint matches inputHash (i.e. the underlying data is unchanged). Found
// is false when there's no cache hit. The newest matching row wins.
func (r *AnalyticsRepo) GetCachedSummary(ctx context.Context, storeID uuid.UUID, inputHash string) (summary string, createdAt time.Time, found bool, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT summary::text, created_at
		FROM analytics_ai_summaries
		WHERE store_id = $1 AND input_hash = $2
		ORDER BY created_at DESC
		LIMIT 1
	`, storeID, inputHash).Scan(&summary, &createdAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", time.Time{}, false, nil
		}
		return "", time.Time{}, false, err
	}
	return summary, createdAt, true, nil
}

// SaveSummary persists a freshly generated AI summary keyed by its input hash.
func (r *AnalyticsRepo) SaveSummary(ctx context.Context, storeID uuid.UUID, from, to, inputHash, summaryJSON string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO analytics_ai_summaries (store_id, period_from, period_to, input_hash, summary)
		VALUES ($1, $2::date, $3::date, $4, $5::jsonb)
	`, storeID, from, to, inputHash, summaryJSON)
	return err
}

// HasAnySummary reports whether the store has ever generated an AI summary —
// used to fire the one-time "first summary" email.
func (r *AnalyticsRepo) HasAnySummary(ctx context.Context, storeID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM analytics_ai_summaries WHERE store_id = $1)
	`, storeID).Scan(&exists)
	return exists, err
}

type DayPoint struct {
	Date string `json:"date"`
	InC  int64  `json:"in_cents"`
	OutC int64  `json:"out_cents"`
	RevC int64  `json:"revenue_cents"`
}

type PaySlice struct {
	Method string `json:"method"`
	Cents  int64  `json:"amount_cents"`
}

type AnalyticsOverview struct {
	RevenueCents     int64      `json:"revenue_cents"`
	Orders           int        `json:"orders"`
	AOVCents         int64      `json:"aov_cents"`
	COGSCents        int64      `json:"cogs_cents"`
	GrossProfitCents int64      `json:"gross_profit_cents"`
	MarginPct        float64    `json:"margin_pct"`
	CashInCents      int64      `json:"cash_in_cents"`
	CashOutCents     int64      `json:"cash_out_cents"`
	NetCashCents     int64      `json:"net_cash_cents"`
	Series           []DayPoint `json:"series"`
	Payments         []PaySlice `json:"payments"`
}

// WIB date-window predicates: created_at is timestamptz, occurred_on is date.
const tsWindow = `created_at >= ($2::timestamp AT TIME ZONE 'Asia/Jakarta') AND created_at < ($3::timestamp AT TIME ZONE 'Asia/Jakarta')`
const wibDay = `date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta')::date`

// Overview computes revenue, COGS (consume + dropship), gross profit, and a
// cash-flow view (sales + manual in; restock + manual out) over [from, to)
// where from/to are "YYYY-MM-DD" WIB dates.
func (r *AnalyticsRepo) Overview(ctx context.Context, storeID uuid.UUID, from, to string) (*AnalyticsOverview, error) {
	o := &AnalyticsOverview{Series: []DayPoint{}, Payments: []PaySlice{}}

	if err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(total_cents),0), COUNT(*)
		FROM orders
		WHERE store_id=$1 AND payment_status='paid' AND status != 'cancelled' AND `+tsWindow+`
	`, storeID, from, to).Scan(&o.RevenueCents, &o.Orders); err != nil {
		return nil, err
	}
	if o.Orders > 0 {
		o.AOVCents = o.RevenueCents / int64(o.Orders)
	}

	var consumeCost, dropshipCost int64
	if err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(-quantity * unit_cost_cents),0)
		FROM material_movements
		WHERE store_id=$1 AND movement_type='consume' AND `+tsWindow+`
	`, storeID, from, to).Scan(&consumeCost); err != nil {
		return nil, err
	}
	if err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(oi.reseller_cost_cents * oi.quantity),0)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE o.store_id=$1 AND o.payment_status='paid' AND o.status != 'cancelled'
		  AND o.created_at >= ($2::timestamp AT TIME ZONE 'Asia/Jakarta')
		  AND o.created_at <  ($3::timestamp AT TIME ZONE 'Asia/Jakarta')
	`, storeID, from, to).Scan(&dropshipCost); err != nil {
		return nil, err
	}
	o.COGSCents = consumeCost + dropshipCost
	o.GrossProfitCents = o.RevenueCents - o.COGSCents
	if o.RevenueCents > 0 {
		o.MarginPct = float64(o.GrossProfitCents) / float64(o.RevenueCents) * 100
	}

	var restockOut int64
	if err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(quantity * unit_cost_cents),0)
		FROM material_movements
		WHERE store_id=$1 AND movement_type='restock' AND `+tsWindow+`
	`, storeID, from, to).Scan(&restockOut); err != nil {
		return nil, err
	}

	var manualIn, manualOut int64
	mrows, err := r.pool.Query(ctx, `
		SELECT direction, COALESCE(SUM(amount_cents),0)
		FROM cash_entries
		WHERE store_id=$1 AND occurred_on >= $2::date AND occurred_on < $3::date
		GROUP BY direction
	`, storeID, from, to)
	if err != nil {
		return nil, err
	}
	for mrows.Next() {
		var dir string
		var amt int64
		if err := mrows.Scan(&dir, &amt); err != nil {
			mrows.Close()
			return nil, err
		}
		if dir == "in" {
			manualIn = amt
		} else {
			manualOut = amt
		}
	}
	mrows.Close()
	if err := mrows.Err(); err != nil {
		return nil, err
	}

	o.CashInCents = o.RevenueCents + manualIn
	o.CashOutCents = restockOut + manualOut
	o.NetCashCents = o.CashInCents - o.CashOutCents

	// Daily series.
	type dayAgg struct{ in, out, rev int64 }
	byDay := map[string]*dayAgg{}
	get := func(d string) *dayAgg {
		if byDay[d] == nil {
			byDay[d] = &dayAgg{}
		}
		return byDay[d]
	}
	if rows, err := r.pool.Query(ctx, `
		SELECT `+wibDay+` AS d, COALESCE(SUM(total_cents),0)
		FROM orders WHERE store_id=$1 AND payment_status='paid' AND status != 'cancelled' AND `+tsWindow+`
		GROUP BY d
	`, storeID, from, to); err == nil {
		for rows.Next() {
			var d time.Time
			var amt int64
			if rows.Scan(&d, &amt) == nil {
				a := get(d.Format("2006-01-02"))
				a.rev += amt
				a.in += amt
			}
		}
		rows.Close()
	}
	if rows, err := r.pool.Query(ctx, `
		SELECT `+wibDay+` AS d, COALESCE(SUM(quantity*unit_cost_cents),0)
		FROM material_movements WHERE store_id=$1 AND movement_type='restock' AND `+tsWindow+`
		GROUP BY d
	`, storeID, from, to); err == nil {
		for rows.Next() {
			var d time.Time
			var amt int64
			if rows.Scan(&d, &amt) == nil {
				get(d.Format("2006-01-02")).out += amt
			}
		}
		rows.Close()
	}
	if rows, err := r.pool.Query(ctx, `
		SELECT occurred_on, direction, COALESCE(SUM(amount_cents),0)
		FROM cash_entries WHERE store_id=$1 AND occurred_on >= $2::date AND occurred_on < $3::date
		GROUP BY occurred_on, direction
	`, storeID, from, to); err == nil {
		for rows.Next() {
			var d time.Time
			var dir string
			var amt int64
			if rows.Scan(&d, &dir, &amt) == nil {
				a := get(d.Format("2006-01-02"))
				if dir == "in" {
					a.in += amt
				} else {
					a.out += amt
				}
			}
		}
		rows.Close()
	}
	if fromT, err := time.Parse("2006-01-02", from); err == nil {
		if toT, err := time.Parse("2006-01-02", to); err == nil {
			for d := fromT; d.Before(toT); d = d.AddDate(0, 0, 1) {
				key := d.Format("2006-01-02")
				a := byDay[key]
				if a == nil {
					a = &dayAgg{}
				}
				o.Series = append(o.Series, DayPoint{Date: key, InC: a.in, OutC: a.out, RevC: a.rev})
			}
		}
	}

	prows, err := r.pool.Query(ctx, `
		SELECT COALESCE(NULLIF(payment_method,''),'lainnya'), COALESCE(SUM(total_cents),0)
		FROM orders WHERE store_id=$1 AND payment_status='paid' AND status != 'cancelled' AND `+tsWindow+`
		GROUP BY 1 ORDER BY 2 DESC
	`, storeID, from, to)
	if err != nil {
		return nil, err
	}
	defer prows.Close()
	for prows.Next() {
		var p PaySlice
		if err := prows.Scan(&p.Method, &p.Cents); err != nil {
			return nil, err
		}
		o.Payments = append(o.Payments, p)
	}
	return o, prows.Err()
}
