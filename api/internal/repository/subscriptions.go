package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Subscription struct {
	ID                 uuid.UUID
	StoreID            uuid.UUID
	Plan               string
	Status             string
	CurrentPeriodStart *time.Time
	CurrentPeriodEnd   *time.Time
	CancelledAt        *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type SubscriptionInvoice struct {
	ID             uuid.UUID
	StoreID        uuid.UUID
	SubscriptionID uuid.UUID
	AmountCents    int64
	Status         string
	PeriodStart    *time.Time
	PeriodEnd      *time.Time
	PaidAt         *time.Time
	Notes          string
	CreatedAt      time.Time
}

type SubscriptionRepo struct {
	pool *pgxpool.Pool
}

func NewSubscriptionRepo(pool *pgxpool.Pool) *SubscriptionRepo {
	return &SubscriptionRepo{pool: pool}
}

const subscriptionCols = `id, store_id, plan, status, current_period_start,
	current_period_end, cancelled_at, created_at, updated_at`

func scanSubscription(row pgx.Row) (*Subscription, error) {
	var s Subscription
	if err := row.Scan(
		&s.ID, &s.StoreID, &s.Plan, &s.Status,
		&s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelledAt,
		&s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

// GetOrCreate returns the store's subscription, creating a default 'free'
// row if none exists. Idempotent — safe to call from a GET handler.
func (r *SubscriptionRepo) GetOrCreate(ctx context.Context, storeID uuid.UUID) (*Subscription, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+subscriptionCols+`
		FROM subscriptions WHERE store_id = $1
	`, storeID)
	s, err := scanSubscription(row)
	if err == nil {
		// Lazy expiry: if pro plan period ended without renewal, transition
		// to expired. Caller sees the up-to-date state without a cron job.
		if s.Plan == "pro" && s.CurrentPeriodEnd != nil &&
			s.CurrentPeriodEnd.Before(time.Now()) && s.Status != "expired" {
			_, _ = r.pool.Exec(ctx, `
				UPDATE subscriptions
				SET status = 'expired', plan = 'free', updated_at = now()
				WHERE id = $1
			`, s.ID)
			s.Status = "expired"
			s.Plan = "free"
		}
		return s, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	// First time — insert defaults.
	row = r.pool.QueryRow(ctx, `
		INSERT INTO subscriptions (store_id) VALUES ($1)
		RETURNING `+subscriptionCols, storeID)
	return scanSubscription(row)
}

// Upgrade marks the subscription as pro and extends the period by `months`
// from the later of (now, current_period_end). If an invoice is supplied,
// it's recorded as paid in the same transaction.
func (r *SubscriptionRepo) Upgrade(ctx context.Context, storeID uuid.UUID, months int, amountCents int64, notes string) (*Subscription, error) {
	if months <= 0 {
		months = 1
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Ensure subscription row exists.
	if _, err := tx.Exec(ctx,
		`INSERT INTO subscriptions (store_id) VALUES ($1)
		 ON CONFLICT (store_id) DO NOTHING`, storeID); err != nil {
		return nil, err
	}

	// Compute new period end: max(now, current_period_end) + months.
	row := tx.QueryRow(ctx, `
		UPDATE subscriptions
		SET plan = 'pro',
		    status = 'active',
		    current_period_start = COALESCE(current_period_start, now()),
		    current_period_end = GREATEST(
		        COALESCE(current_period_end, now()),
		        now()
		    ) + ($2::int * INTERVAL '1 month'),
		    cancelled_at = NULL,
		    updated_at = now()
		WHERE store_id = $1
		RETURNING `+subscriptionCols, storeID, months)
	s, err := scanSubscription(row)
	if err != nil {
		return nil, err
	}

	if amountCents > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO subscription_invoices
			    (store_id, subscription_id, amount_cents, status,
			     period_start, period_end, paid_at, notes)
			VALUES ($1, $2, $3, 'paid', $4, $5, now(), $6)
		`, storeID, s.ID, amountCents, s.CurrentPeriodStart, s.CurrentPeriodEnd, notes); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

// Cancel sets the cancellation flag. Plan stays active until period_end;
// GetOrCreate handles the transition to expired/free.
func (r *SubscriptionRepo) Cancel(ctx context.Context, storeID uuid.UUID) (*Subscription, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE subscriptions
		SET status = 'cancelled', cancelled_at = now(), updated_at = now()
		WHERE store_id = $1
		RETURNING `+subscriptionCols, storeID)
	return scanSubscription(row)
}

// Resume undoes a cancellation as long as the period hasn't ended.
func (r *SubscriptionRepo) Resume(ctx context.Context, storeID uuid.UUID) (*Subscription, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE subscriptions
		SET status = 'active', cancelled_at = NULL, updated_at = now()
		WHERE store_id = $1 AND current_period_end > now()
		RETURNING `+subscriptionCols, storeID)
	return scanSubscription(row)
}

func (r *SubscriptionRepo) ListInvoices(ctx context.Context, storeID uuid.UUID) ([]SubscriptionInvoice, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, subscription_id, amount_cents, status,
		       period_start, period_end, paid_at, notes, created_at
		FROM subscription_invoices
		WHERE store_id = $1
		ORDER BY created_at DESC
		LIMIT 100
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SubscriptionInvoice
	for rows.Next() {
		var inv SubscriptionInvoice
		if err := rows.Scan(
			&inv.ID, &inv.StoreID, &inv.SubscriptionID, &inv.AmountCents,
			&inv.Status, &inv.PeriodStart, &inv.PeriodEnd, &inv.PaidAt,
			&inv.Notes, &inv.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

// CreatePendingInvoice records that a seller intends to pay (e.g. clicked
// "Saya sudah transfer"). Ops then verifies and either calls Upgrade
// (which marks paid) or marks the row failed.
func (r *SubscriptionRepo) CreatePendingInvoice(ctx context.Context, storeID, subscriptionID uuid.UUID, amountCents int64, notes string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO subscription_invoices
		    (store_id, subscription_id, amount_cents, status, notes)
		VALUES ($1, $2, $3, 'pending', $4)
	`, storeID, subscriptionID, amountCents, notes)
	return err
}
