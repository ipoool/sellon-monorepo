package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Order struct {
	ID                uuid.UUID
	StoreID           uuid.UUID
	OrderNumber       string
	Status            string
	PaymentStatus     string
	PaymentMethod     string
	SubtotalCents     int64
	ShippingCents     int64
	TotalCents        int64
	Courier           string
	CustomerName      string
	CustomerWhatsApp  string
	CustomerCity      string
	CreatedAt         time.Time
}

type OrderRepo struct {
	pool *pgxpool.Pool
}

func NewOrderRepo(pool *pgxpool.Pool) *OrderRepo {
	return &OrderRepo{pool: pool}
}

func (r *OrderRepo) ListByStore(ctx context.Context, storeID uuid.UUID, limit int) ([]Order, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, order_number, status, payment_status, payment_method,
		       subtotal_cents, shipping_cents, total_cents, courier,
		       customer_name, customer_whatsapp, customer_city, created_at
		FROM orders
		WHERE store_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, storeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(
			&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
			&o.SubtotalCents, &o.ShippingCents, &o.TotalCents, &o.Courier,
			&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerCity, &o.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (r *OrderRepo) StatsForStore(ctx context.Context, storeID uuid.UUID) (todayCount int, monthRevenueCents int64, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())),
		    COALESCE(SUM(total_cents) FILTER (WHERE created_at >= date_trunc('month', now()) AND payment_status = 'paid'), 0)
		FROM orders WHERE store_id = $1
	`, storeID).Scan(&todayCount, &monthRevenueCents)
	return
}
