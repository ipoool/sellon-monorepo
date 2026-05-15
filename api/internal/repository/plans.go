package repository

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPlanNotFound = errors.New("plan not found")

type Plan struct {
	Tier              string
	Name              string
	MonthlyPriceCents int64
	YearlyPriceCents  int64
	Currency          string
	SortOrder         int
	// Enforcement caps. -1 means unlimited.
	ProductLimit      int
	StaffLimit        int
	OrderMonthlyLimit int
	PromoLimit        int
	// Marketing metadata yang dipakai di landing page pricing card +
	// signup flow. Admin bisa edit via /platform/plans.
	Description        string
	Features           []string // JSONB array of bullet strings
	CTALabel           string
	PeriodMonthlyLabel string
	PeriodYearlyLabel  string
	Highlighted        bool
	UpdatedAt          time.Time
}

type PlanRepo struct {
	pool *pgxpool.Pool
}

func NewPlanRepo(pool *pgxpool.Pool) *PlanRepo {
	return &PlanRepo{pool: pool}
}

const planCols = `tier, name, monthly_price_cents, yearly_price_cents,
	currency, sort_order,
	product_limit, staff_limit, order_monthly_limit, promo_limit,
	description, features, cta_label, period_monthly_label,
	period_yearly_label, highlighted,
	updated_at`

func scanPlan(row pgx.Row) (*Plan, error) {
	var p Plan
	var featuresJSON []byte
	if err := row.Scan(
		&p.Tier, &p.Name, &p.MonthlyPriceCents, &p.YearlyPriceCents,
		&p.Currency, &p.SortOrder,
		&p.ProductLimit, &p.StaffLimit, &p.OrderMonthlyLimit, &p.PromoLimit,
		&p.Description, &featuresJSON, &p.CTALabel,
		&p.PeriodMonthlyLabel, &p.PeriodYearlyLabel, &p.Highlighted,
		&p.UpdatedAt,
	); err != nil {
		return nil, err
	}
	// Decode JSONB features ke []string. Empty/null jadi empty slice.
	if len(featuresJSON) > 0 {
		if err := json.Unmarshal(featuresJSON, &p.Features); err != nil {
			return nil, err
		}
	}
	if p.Features == nil {
		p.Features = []string{}
	}
	return &p, nil
}

// List returns all plans ordered by sort_order. Used by the public
// /api/v1/plans endpoint and the /admin/plans editor.
func (r *PlanRepo) List(ctx context.Context) ([]Plan, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+planCols+` FROM plans ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Plan
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// Get fetches a single plan by tier. Returns ErrPlanNotFound when the
// tier doesn't exist.
func (r *PlanRepo) Get(ctx context.Context, tier string) (*Plan, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+planCols+` FROM plans WHERE tier = $1`, tier)
	p, err := scanPlan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPlanNotFound
	}
	return p, err
}

type UpdatePlanInput struct {
	Name               string
	MonthlyPriceCents  int64
	YearlyPriceCents   int64
	ProductLimit       int
	StaffLimit         int
	OrderMonthlyLimit  int
	PromoLimit         int
	Description        string
	Features           []string
	CTALabel           string
	PeriodMonthlyLabel string
	PeriodYearlyLabel  string
	Highlighted        bool
}

// Update changes the editable fields for a tier. Tier itself is the
// PK and is not editable.
func (r *PlanRepo) Update(ctx context.Context, tier string, in UpdatePlanInput) (*Plan, error) {
	// Always pass JSONB as bytes — even empty array {[]} agar kolom
	// NOT NULL puas. Marshal lebih aman dari naked string concat.
	features := in.Features
	if features == nil {
		features = []string{}
	}
	featuresJSON, err := json.Marshal(features)
	if err != nil {
		return nil, err
	}

	row := r.pool.QueryRow(ctx, `
		UPDATE plans
		SET name = $2,
		    monthly_price_cents = $3,
		    yearly_price_cents = $4,
		    product_limit = $5,
		    staff_limit = $6,
		    order_monthly_limit = $7,
		    promo_limit = $8,
		    description = $9,
		    features = $10::jsonb,
		    cta_label = $11,
		    period_monthly_label = $12,
		    period_yearly_label = $13,
		    highlighted = $14,
		    updated_at = now()
		WHERE tier = $1
		RETURNING `+planCols,
		tier, in.Name, in.MonthlyPriceCents, in.YearlyPriceCents,
		in.ProductLimit, in.StaffLimit, in.OrderMonthlyLimit, in.PromoLimit,
		in.Description, string(featuresJSON), in.CTALabel,
		in.PeriodMonthlyLabel, in.PeriodYearlyLabel, in.Highlighted,
	)
	p, err := scanPlan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPlanNotFound
	}
	return p, err
}

// MonthlyPrice is the convenience used by checkout / quota validation.
// Returns 0 if the plan can't be loaded — caller decides how to handle.
func (r *PlanRepo) MonthlyPrice(ctx context.Context, tier string) int64 {
	p, err := r.Get(ctx, tier)
	if err != nil || p == nil {
		return 0
	}
	return p.MonthlyPriceCents
}
