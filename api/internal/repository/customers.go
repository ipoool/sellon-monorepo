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

func (r *CustomerRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]Customer, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, name, whatsapp_number, email, address, city, province,
		       postal_code, notes, is_blacklisted, total_orders, total_spent_cents,
		       last_order_at, created_at
		FROM customers
		WHERE store_id = $1
		ORDER BY last_order_at DESC NULLS LAST, created_at DESC
		LIMIT 500
	`, storeID)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *CustomerRepo) CountByStore(ctx context.Context, storeID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM customers WHERE store_id = $1", storeID).Scan(&n)
	return n, err
}
