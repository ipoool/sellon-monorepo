package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MembershipTier is a store-configurable loyalty tier reached automatically by
// lifetime spend. Perks: point_multiplier (earn boost) + discount_percent
// (auto member discount).
type MembershipTier struct {
	ID              uuid.UUID
	StoreID         uuid.UUID
	Name            string
	MinSpentCents   int64
	PointMultiplier float64
	DiscountPercent int
	SortOrder       int
	IsActive        bool
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type MembershipTierInput struct {
	Name            string
	MinSpentCents   int64
	PointMultiplier float64
	DiscountPercent int
	IsActive        bool
}

type MembershipTierRepo struct {
	pool *pgxpool.Pool
}

func NewMembershipTierRepo(pool *pgxpool.Pool) *MembershipTierRepo {
	return &MembershipTierRepo{pool: pool}
}

// ListByStore returns all tiers (active + inactive) ordered by threshold.
func (r *MembershipTierRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]MembershipTier, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, name, min_spent_cents, point_multiplier, discount_percent,
		       sort_order, is_active, created_at, updated_at
		FROM membership_tiers
		WHERE store_id = $1
		ORDER BY min_spent_cents ASC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MembershipTier
	for rows.Next() {
		var t MembershipTier
		if err := rows.Scan(&t.ID, &t.StoreID, &t.Name, &t.MinSpentCents, &t.PointMultiplier,
			&t.DiscountPercent, &t.SortOrder, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Replace nukes existing tiers for a store and inserts the new list. Tier lists
// are small; batch-replace is simpler than diffing.
func (r *MembershipTierRepo) Replace(ctx context.Context, storeID uuid.UUID, inputs []MembershipTierInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM membership_tiers WHERE store_id = $1`, storeID); err != nil {
		return err
	}
	for i, in := range inputs {
		if in.Name == "" {
			continue
		}
		mult := in.PointMultiplier
		if mult <= 0 {
			mult = 1.0
		}
		disc := in.DiscountPercent
		if disc < 0 {
			disc = 0
		}
		if disc > 100 {
			disc = 100
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO membership_tiers
			    (store_id, name, min_spent_cents, point_multiplier, discount_percent, sort_order, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, storeID, in.Name, max64(0, in.MinSpentCents), mult, disc, i, in.IsActive); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// ResolveTier returns the active tier with the highest min_spent_cents that the
// given lifetime spend qualifies for, or nil when no tier matches.
func ResolveTier(tiers []MembershipTier, totalSpentCents int64) *MembershipTier {
	var best *MembershipTier
	for i := range tiers {
		t := &tiers[i]
		if !t.IsActive || t.MinSpentCents > totalSpentCents {
			continue
		}
		if best == nil || t.MinSpentCents > best.MinSpentCents {
			best = t
		}
	}
	return best
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// resolveTierMultiplierTx returns the customer's current tier point multiplier
// (1.0 when no tier matches), from their lifetime spend. Used at earn time.
func resolveTierMultiplierTx(ctx context.Context, tx pgx.Tx, storeID, customerID uuid.UUID) (float64, error) {
	var mult float64
	err := tx.QueryRow(ctx, `
		SELECT mt.point_multiplier
		FROM membership_tiers mt, customers c
		WHERE c.id = $2 AND c.store_id = $1
		  AND mt.store_id = $1 AND mt.is_active
		  AND mt.min_spent_cents <= c.total_spent_cents
		ORDER BY mt.min_spent_cents DESC
		LIMIT 1
	`, storeID, customerID).Scan(&mult)
	if errors.Is(err, pgx.ErrNoRows) {
		return 1.0, nil
	}
	if err != nil {
		return 1.0, err
	}
	if mult <= 0 {
		return 1.0, nil
	}
	return mult, nil
}
