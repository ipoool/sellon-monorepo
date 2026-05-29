package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrKitchenOrderNotFound = errors.New("kitchen order not found")

// kitchenNext maps the current kitchen status to the next one on bump.
var kitchenNext = map[string]string{
	"queued":    "preparing",
	"preparing": "ready",
	"ready":     "served",
}

type KitchenOrder struct {
	OrderID       uuid.UUID
	OrderNumber   string
	QueueNumber   *int
	KitchenStatus string
	ServingType   string
	TableLabel    string
	CustomerName  string
	CreatedAt     time.Time
	Items         []KitchenItem
}

type KitchenItem struct {
	Name     string
	Quantity int
}

type KitchenRepo struct {
	pool *pgxpool.Pool
}

func NewKitchenRepo(pool *pgxpool.Pool) *KitchenRepo { return &KitchenRepo{pool: pool} }

// allocQueueNumberTx atomically increments + returns today's queue counter for
// the store. Uses ON CONFLICT so no row lock is held across the order tx.
func allocQueueNumberTx(ctx context.Context, tx pgx.Tx, storeID uuid.UUID, queueDate string) (int, error) {
	var n int
	err := tx.QueryRow(ctx, `
		INSERT INTO order_queue_counters (store_id, queue_date, last_number)
		VALUES ($1, $2::date, 1)
		ON CONFLICT (store_id, queue_date)
		DO UPDATE SET last_number = order_queue_counters.last_number + 1
		RETURNING last_number
	`, storeID, queueDate).Scan(&n)
	return n, err
}

// ListActive returns kitchen orders that aren't yet served, for the KDS board.
func (r *KitchenRepo) ListActive(ctx context.Context, storeID uuid.UUID) ([]KitchenOrder, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT o.id, o.order_number, o.queue_number, o.kitchen_status, o.serving_type,
		       COALESCE(t.label, ''), o.customer_name, o.created_at
		FROM orders o
		LEFT JOIN restaurant_tables t ON t.id = o.table_id
		WHERE o.store_id = $1 AND o.kitchen_status IN ('queued','preparing','ready')
		ORDER BY o.created_at ASC
		LIMIT 100
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KitchenOrder
	ids := []uuid.UUID{}
	idx := map[uuid.UUID]int{}
	for rows.Next() {
		var k KitchenOrder
		if err := rows.Scan(&k.OrderID, &k.OrderNumber, &k.QueueNumber, &k.KitchenStatus,
			&k.ServingType, &k.TableLabel, &k.CustomerName, &k.CreatedAt); err != nil {
			return nil, err
		}
		idx[k.OrderID] = len(out)
		ids = append(ids, k.OrderID)
		out = append(out, k)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return out, nil
	}
	// Batch-load line items.
	irows, err := r.pool.Query(ctx, `
		SELECT order_id, product_name, quantity FROM order_items WHERE order_id = ANY($1)
	`, ids)
	if err != nil {
		return nil, err
	}
	defer irows.Close()
	for irows.Next() {
		var oid uuid.UUID
		var name string
		var qty int
		if err := irows.Scan(&oid, &name, &qty); err != nil {
			return nil, err
		}
		if i, ok := idx[oid]; ok {
			out[i].Items = append(out[i].Items, KitchenItem{Name: name, Quantity: qty})
		}
	}
	return out, irows.Err()
}

// Bump advances an order's kitchen_status one step. When it reaches 'served'
// (and is paid) the order is completed. Returns the new status.
func (r *KitchenRepo) Bump(ctx context.Context, storeID, orderID uuid.UUID) (string, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var cur, payStatus string
	if err := tx.QueryRow(ctx,
		`SELECT kitchen_status, payment_status FROM orders WHERE id = $1 AND store_id = $2 FOR UPDATE`,
		orderID, storeID).Scan(&cur, &payStatus); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrKitchenOrderNotFound
		}
		return "", err
	}
	next, ok := kitchenNext[cur]
	if !ok {
		return cur, nil // already served / not a kitchen order
	}
	readyStamp := ""
	if next == "ready" {
		readyStamp = ", kitchen_ready_at = now()"
	}
	if _, err := tx.Exec(ctx,
		`UPDATE orders SET kitchen_status = $3`+readyStamp+`, updated_at = now() WHERE id = $1 AND store_id = $2`,
		orderID, storeID, next); err != nil {
		return "", err
	}
	// Served + already paid → close the order.
	if next == "served" && payStatus == "paid" {
		if _, err := tx.Exec(ctx,
			`UPDATE orders SET status = 'completed', completed_at = now() WHERE id = $1 AND store_id = $2 AND status != 'cancelled'`,
			orderID, storeID); err != nil {
			return "", err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return next, nil
}

// ListQueue returns today's preparing + ready orders for the public queue board.
func (r *KitchenRepo) ListQueue(ctx context.Context, storeID uuid.UUID) ([]KitchenOrder, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT o.id, o.order_number, o.queue_number, o.kitchen_status, o.serving_type,
		       COALESCE(t.label, ''), '', o.created_at
		FROM orders o
		LEFT JOIN restaurant_tables t ON t.id = o.table_id
		WHERE o.store_id = $1 AND o.kitchen_status IN ('preparing','ready')
		  AND o.queue_date = (now() AT TIME ZONE 'Asia/Jakarta')::date
		ORDER BY o.queue_number ASC
		LIMIT 100
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KitchenOrder
	for rows.Next() {
		var k KitchenOrder
		if err := rows.Scan(&k.OrderID, &k.OrderNumber, &k.QueueNumber, &k.KitchenStatus,
			&k.ServingType, &k.TableLabel, &k.CustomerName, &k.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}
