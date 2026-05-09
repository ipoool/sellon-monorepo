package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PromoType string

const (
	PromoPercent      PromoType = "percent"
	PromoFixed        PromoType = "fixed"
	PromoFreeShipping PromoType = "free_shipping"
)

type Promo struct {
	ID               uuid.UUID
	StoreID          uuid.UUID
	Code             string
	Type             PromoType
	Value            int64
	MinPurchaseCents int64
	MaxUsage         int
	UsedCount        int
	StartsAt         *time.Time
	ExpiresAt        *time.Time
	IsActive         bool
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type PromoRepo struct {
	pool *pgxpool.Pool
}

func NewPromoRepo(pool *pgxpool.Pool) *PromoRepo {
	return &PromoRepo{pool: pool}
}

var (
	ErrPromoNotFound      = errors.New("promo not found")
	ErrPromoCodeDuplicate = errors.New("promo code already exists")
)

const promoCols = `id, store_id, code, type, value, min_purchase_cents,
	max_usage, used_count, starts_at, expires_at, is_active,
	created_at, updated_at`

func scanPromo(row pgx.Row) (*Promo, error) {
	var p Promo
	if err := row.Scan(
		&p.ID, &p.StoreID, &p.Code, &p.Type, &p.Value, &p.MinPurchaseCents,
		&p.MaxUsage, &p.UsedCount, &p.StartsAt, &p.ExpiresAt, &p.IsActive,
		&p.CreatedAt, &p.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PromoRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]Promo, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+promoCols+`
		FROM promos WHERE store_id = $1
		ORDER BY created_at DESC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Promo
	for rows.Next() {
		p, err := scanPromo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (r *PromoRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Promo, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+promoCols+`
		FROM promos WHERE store_id = $1 AND id = $2
	`, storeID, id)
	p, err := scanPromo(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPromoNotFound
	}
	return p, err
}

// FindByCode is used by the storefront to validate a buyer-entered code.
// Match is case-insensitive (codes are stored upper-cased).
func (r *PromoRepo) FindByCode(ctx context.Context, storeID uuid.UUID, code string) (*Promo, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+promoCols+`
		FROM promos WHERE store_id = $1 AND code = UPPER($2)
	`, storeID, code)
	p, err := scanPromo(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPromoNotFound
	}
	return p, err
}

type PromoInput struct {
	Code             string
	Type             PromoType
	Value            int64
	MinPurchaseCents int64
	MaxUsage         int
	StartsAt         *time.Time
	ExpiresAt        *time.Time
	IsActive         bool
}

func (r *PromoRepo) Create(ctx context.Context, storeID uuid.UUID, in PromoInput) (*Promo, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO promos (store_id, code, type, value, min_purchase_cents,
			max_usage, starts_at, expires_at, is_active)
		VALUES ($1, UPPER($2), $3, $4, $5, $6, $7, $8, $9)
		RETURNING `+promoCols+`
	`, storeID, in.Code, in.Type, in.Value, in.MinPurchaseCents,
		in.MaxUsage, in.StartsAt, in.ExpiresAt, in.IsActive)
	p, err := scanPromo(row)
	if err != nil {
		// Rough duplicate check — pgx wraps unique violation.
		if isUniqueViolation(err) {
			return nil, ErrPromoCodeDuplicate
		}
		return nil, err
	}
	return p, nil
}

func (r *PromoRepo) Update(ctx context.Context, storeID, id uuid.UUID, in PromoInput) (*Promo, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE promos
		SET code = UPPER($3), type = $4, value = $5,
		    min_purchase_cents = $6, max_usage = $7,
		    starts_at = $8, expires_at = $9, is_active = $10,
		    updated_at = now()
		WHERE store_id = $1 AND id = $2
		RETURNING `+promoCols+`
	`, storeID, id, in.Code, in.Type, in.Value, in.MinPurchaseCents,
		in.MaxUsage, in.StartsAt, in.ExpiresAt, in.IsActive)
	p, err := scanPromo(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPromoNotFound
	}
	if err != nil && isUniqueViolation(err) {
		return nil, ErrPromoCodeDuplicate
	}
	return p, err
}

func (r *PromoRepo) Delete(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM promos WHERE store_id = $1 AND id = $2`,
		storeID, id,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPromoNotFound
	}
	return nil
}

// IncrementUsage is called when an order successfully redeems this promo.
func (r *PromoRepo) IncrementUsage(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE promos SET used_count = used_count + 1, updated_at = now() WHERE id = $1`,
		id,
	)
	return err
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "23505")
}
