package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Customer struct {
	ID              uuid.UUID
	StoreID         uuid.UUID
	Name            string
	WhatsAppNumber  string
	Email           string
	Address         string
	City            string
	Province        string
	PostalCode      string
	Notes           string
	IsBlacklisted   bool
	TotalOrders     int
	TotalSpentCents int64
	LastOrderAt     *time.Time
	CreatedAt       time.Time
}

type CustomerRepo struct {
	pool *pgxpool.Pool
}

func NewCustomerRepo(pool *pgxpool.Pool) *CustomerRepo {
	return &CustomerRepo{pool: pool}
}

// ListByStore returns up to `limit` customers starting at `offset`, plus the
// total row count for the store (so the caller can render pagination).
// Pass limit=0 to fall back to a sane default (200) — matches the old
// behavior for any caller that hasn't been updated yet.
func (r *CustomerRepo) ListByStore(
	ctx context.Context, storeID uuid.UUID, limit, offset int,
) ([]Customer, int, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	var total int
	if err := r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM customers WHERE store_id = $1", storeID,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, name, whatsapp_number, email, address, city, province,
		       postal_code, notes, is_blacklisted, total_orders, total_spent_cents,
		       last_order_at, created_at
		FROM customers
		WHERE store_id = $1
		ORDER BY last_order_at DESC NULLS LAST, created_at DESC
		LIMIT $2 OFFSET $3
	`, storeID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []Customer
	for rows.Next() {
		var c Customer
		if err := rows.Scan(
			&c.ID, &c.StoreID, &c.Name, &c.WhatsAppNumber, &c.Email,
			&c.Address, &c.City, &c.Province, &c.PostalCode, &c.Notes,
			&c.IsBlacklisted, &c.TotalOrders, &c.TotalSpentCents,
			&c.LastOrderAt, &c.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

func (r *CustomerRepo) CountByStore(ctx context.Context, storeID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM customers WHERE store_id = $1", storeID).Scan(&n)
	return n, err
}

func (r *CustomerRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Customer, error) {
	var c Customer
	err := r.pool.QueryRow(ctx, `
		SELECT id, store_id, name, whatsapp_number, email, address, city, province,
		       postal_code, notes, is_blacklisted, total_orders, total_spent_cents,
		       last_order_at, created_at
		FROM customers
		WHERE store_id = $1 AND id = $2
	`, storeID, id).Scan(
		&c.ID, &c.StoreID, &c.Name, &c.WhatsAppNumber, &c.Email,
		&c.Address, &c.City, &c.Province, &c.PostalCode, &c.Notes,
		&c.IsBlacklisted, &c.TotalOrders, &c.TotalSpentCents,
		&c.LastOrderAt, &c.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// UpdateProfile patches the seller-editable fields (notes + blacklist flag).
// All other fields are derived from order history and shouldn't be hand-edited.
func (r *CustomerRepo) UpdateProfile(ctx context.Context, storeID, id uuid.UUID, notes string, isBlacklisted bool) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE customers
		SET notes = $3, is_blacklisted = $4, updated_at = now()
		WHERE store_id = $1 AND id = $2
	`, storeID, id, notes, isBlacklisted)
	return err
}
