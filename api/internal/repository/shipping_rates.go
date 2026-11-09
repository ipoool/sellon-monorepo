package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ShippingRateRepo owns the seller-defined ongkir table.
type ShippingRateRepo struct {
	pool *pgxpool.Pool
}

func NewShippingRateRepo(pool *pgxpool.Pool) *ShippingRateRepo {
	return &ShippingRateRepo{pool: pool}
}

var (
	ErrShippingRateNotFound = errors.New("shipping rate not found")
	// ErrFallbackExists means the store already has a live "semua area
	// lain" row. Surfaced from the partial unique index, not from a read.
	ErrFallbackExists = errors.New("store already has an active fallback rate")
)

// ShippingRate is one seller-defined ongkir option.
type ShippingRate struct {
	ID      uuid.UUID
	StoreID uuid.UUID

	Name       string
	PriceCents int64
	ETA        string

	// Normalised city names. Empty means "available everywhere" — which is
	// how in-store pickup is written, and is NOT the same as IsFallback.
	Areas      []string
	IsFallback bool

	IsActive  bool
	SortOrder int

	CreatedAt time.Time
	UpdatedAt time.Time
}

const shippingRateCols = `id, store_id, name, price_cents, eta, areas,
	is_fallback, is_active, sort_order, created_at, updated_at`

func scanShippingRate(row pgx.Row) (*ShippingRate, error) {
	var r ShippingRate
	err := row.Scan(&r.ID, &r.StoreID, &r.Name, &r.PriceCents, &r.ETA,
		&r.Areas, &r.IsFallback, &r.IsActive, &r.SortOrder,
		&r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrShippingRateNotFound
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// ListForStore returns every rate, active or not, in display order. Used by
// the settings screen.
func (r *ShippingRateRepo) ListForStore(
	ctx context.Context, storeID uuid.UUID,
) ([]ShippingRate, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+shippingRateCols+` FROM shipping_rates
		 WHERE store_id = $1 ORDER BY sort_order, created_at`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ShippingRate{}
	for rows.Next() {
		rate, serr := scanShippingRate(rows)
		if serr != nil {
			return nil, serr
		}
		out = append(out, *rate)
	}
	return out, rows.Err()
}

// ListActive returns only the rates a buyer could be offered. The storefront
// quote path uses this, so it must never include a disabled row.
func (r *ShippingRateRepo) ListActive(
	ctx context.Context, storeID uuid.UUID,
) ([]ShippingRate, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+shippingRateCols+` FROM shipping_rates
		 WHERE store_id = $1 AND is_active
		 ORDER BY sort_order, created_at`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ShippingRate{}
	for rows.Next() {
		rate, serr := scanShippingRate(rows)
		if serr != nil {
			return nil, serr
		}
		out = append(out, *rate)
	}
	return out, rows.Err()
}

func (r *ShippingRateRepo) Create(
	ctx context.Context, in ShippingRate,
) (*ShippingRate, error) {
	rate, err := scanShippingRate(r.pool.QueryRow(ctx,
		`INSERT INTO shipping_rates
		     (store_id, name, price_cents, eta, areas, is_fallback, is_active, sort_order)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING `+shippingRateCols,
		in.StoreID, in.Name, in.PriceCents, in.ETA, in.Areas,
		in.IsFallback, in.IsActive, in.SortOrder))
	return rate, mapFallbackConflict(err)
}

// Update rewrites one rate. Scoped by store_id as well as id so a crafted
// request cannot edit another tenant's row.
func (r *ShippingRateRepo) Update(
	ctx context.Context, in ShippingRate,
) (*ShippingRate, error) {
	rate, err := scanShippingRate(r.pool.QueryRow(ctx,
		`UPDATE shipping_rates SET
		     name = $3, price_cents = $4, eta = $5, areas = $6,
		     is_fallback = $7, is_active = $8, sort_order = $9,
		     updated_at = now()
		 WHERE id = $1 AND store_id = $2
		 RETURNING `+shippingRateCols,
		in.ID, in.StoreID, in.Name, in.PriceCents, in.ETA, in.Areas,
		in.IsFallback, in.IsActive, in.SortOrder))
	return rate, mapFallbackConflict(err)
}

func (r *ShippingRateRepo) Delete(
	ctx context.Context, storeID, id uuid.UUID,
) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM shipping_rates WHERE id = $1 AND store_id = $2`, id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrShippingRateNotFound
	}
	return nil
}

// mapFallbackConflict turns the partial unique index violation into a
// domain error the handler can phrase for a seller.
//
// Matched on the CONSTRAINT NAME, not on the message text: the message
// embeds the rate's name, which is something a seller typed into a form.
func mapFallbackConflict(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" &&
		pgErr.ConstraintName == "shipping_rates_one_fallback" {
		return ErrFallbackExists
	}
	return err
}
