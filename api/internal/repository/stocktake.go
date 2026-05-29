package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrStockTakeNotFound = errors.New("stock take not found")
	ErrStockTakePosted   = errors.New("stock take sudah diposting")
)

type StockTake struct {
	ID        uuid.UUID
	StoreID   uuid.UUID
	Status    string
	Note      string
	ItemCount int // joined
	CreatedAt time.Time
	PostedAt  *time.Time
}

type StockTakeItem struct {
	ID           uuid.UUID
	MaterialID   uuid.UUID
	MaterialName string // joined
	BaseUnit     string // joined
	SystemQty    int64
	CountedQty   int64
}

type StockTakeRepo struct {
	pool *pgxpool.Pool
}

func NewStockTakeRepo(pool *pgxpool.Pool) *StockTakeRepo { return &StockTakeRepo{pool: pool} }

// Create opens a draft opname snapshotting current stock of all active
// materials as system_qty (counted defaults to system so untouched rows are
// no-ops when posted).
func (r *StockTakeRepo) Create(ctx context.Context, storeID uuid.UUID, note string) (uuid.UUID, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	if err := tx.QueryRow(ctx,
		`INSERT INTO stock_takes (store_id, note) VALUES ($1, $2) RETURNING id`,
		storeID, note,
	).Scan(&id); err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO stock_take_items (stock_take_id, material_id, system_qty, counted_qty)
		SELECT $1, id, stock, stock FROM materials WHERE store_id = $2 AND is_active = true
	`, id, storeID); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (r *StockTakeRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]StockTake, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT st.id, st.store_id, st.status, st.note, st.created_at, st.posted_at,
		       (SELECT count(*) FROM stock_take_items WHERE stock_take_id = st.id)
		FROM stock_takes st
		WHERE st.store_id = $1
		ORDER BY st.created_at DESC LIMIT 100
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StockTake
	for rows.Next() {
		var s StockTake
		if err := rows.Scan(&s.ID, &s.StoreID, &s.Status, &s.Note, &s.CreatedAt, &s.PostedAt, &s.ItemCount); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *StockTakeRepo) Get(ctx context.Context, storeID, id uuid.UUID) (*StockTake, []StockTakeItem, error) {
	var s StockTake
	err := r.pool.QueryRow(ctx, `
		SELECT id, store_id, status, note, created_at, posted_at
		FROM stock_takes WHERE id = $1 AND store_id = $2
	`, id, storeID).Scan(&s.ID, &s.StoreID, &s.Status, &s.Note, &s.CreatedAt, &s.PostedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrStockTakeNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT sti.id, sti.material_id, m.name, m.base_unit, sti.system_qty, sti.counted_qty
		FROM stock_take_items sti
		JOIN materials m ON m.id = sti.material_id
		WHERE sti.stock_take_id = $1
		ORDER BY m.kind, m.name
	`, id)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var items []StockTakeItem
	for rows.Next() {
		var it StockTakeItem
		if err := rows.Scan(&it.ID, &it.MaterialID, &it.MaterialName, &it.BaseUnit, &it.SystemQty, &it.CountedQty); err != nil {
			return nil, nil, err
		}
		items = append(items, it)
	}
	return &s, items, rows.Err()
}

// Post applies the counted quantities: per item where counted != current stock,
// set stock = counted + write an 'adjust' movement (delta, cost snapshot). All
// in one tx. counts maps stock_take_item id → counted_qty.
func (r *StockTakeRepo) Post(ctx context.Context, storeID, id uuid.UUID, counts map[uuid.UUID]int64) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var status string
	if err := tx.QueryRow(ctx,
		`SELECT status FROM stock_takes WHERE id = $1 AND store_id = $2 FOR UPDATE`,
		id, storeID).Scan(&status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrStockTakeNotFound
		}
		return err
	}
	if status != "draft" {
		return ErrStockTakePosted
	}

	// Persist the submitted counts first.
	for itemID, counted := range counts {
		if _, err := tx.Exec(ctx,
			`UPDATE stock_take_items SET counted_qty = $3 WHERE id = $1 AND stock_take_id = $2`,
			itemID, id, counted); err != nil {
			return err
		}
	}

	// Apply adjustments for every item whose count differs from live stock.
	rows, err := tx.Query(ctx, `
		SELECT sti.material_id, sti.counted_qty, m.stock, m.cost_cents
		FROM stock_take_items sti
		JOIN materials m ON m.id = sti.material_id
		WHERE sti.stock_take_id = $1 AND m.store_id = $2
	`, id, storeID)
	if err != nil {
		return err
	}
	type adj struct {
		matID         uuid.UUID
		counted, cur  int64
		cost          int64
	}
	var adjs []adj
	for rows.Next() {
		var a adj
		if err := rows.Scan(&a.matID, &a.counted, &a.cur, &a.cost); err != nil {
			rows.Close()
			return err
		}
		adjs = append(adjs, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, a := range adjs {
		if a.counted == a.cur {
			continue
		}
		delta := a.counted - a.cur
		if _, err := tx.Exec(ctx,
			`UPDATE materials SET stock = $3, updated_at = now() WHERE id = $1 AND store_id = $2`,
			a.matID, storeID, a.counted); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO material_movements (store_id, material_id, movement_type, quantity, unit_cost_cents, note)
			VALUES ($1, $2, 'adjust', $3, $4, 'Stok opname')
		`, storeID, a.matID, delta, a.cost); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE stock_takes SET status = 'posted', posted_at = now() WHERE id = $1 AND store_id = $2`,
		id, storeID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
