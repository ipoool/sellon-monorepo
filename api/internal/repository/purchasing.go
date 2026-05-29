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

var (
	ErrSupplierNotFound = errors.New("supplier not found")
	ErrPONotFound       = errors.New("purchase order not found")
	ErrPONotReceivable  = errors.New("purchase order tidak bisa diterima")
)

// ─── Suppliers ───────────────────────────────────────────────────────────────

type Supplier struct {
	ID        uuid.UUID
	StoreID   uuid.UUID
	Name      string
	Phone     string
	Note      string
	IsActive  bool
	CreatedAt time.Time
}

type SupplierRepo struct {
	pool *pgxpool.Pool
}

func NewSupplierRepo(pool *pgxpool.Pool) *SupplierRepo { return &SupplierRepo{pool: pool} }

func (r *SupplierRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]Supplier, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, name, phone, note, is_active, created_at
		FROM suppliers WHERE store_id = $1 AND is_active = true
		ORDER BY name ASC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Supplier
	for rows.Next() {
		var s Supplier
		if err := rows.Scan(&s.ID, &s.StoreID, &s.Name, &s.Phone, &s.Note, &s.IsActive, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *SupplierRepo) Create(ctx context.Context, storeID uuid.UUID, name, phone, note string) (*Supplier, error) {
	var s Supplier
	err := r.pool.QueryRow(ctx, `
		INSERT INTO suppliers (store_id, name, phone, note)
		VALUES ($1, $2, $3, $4)
		RETURNING id, store_id, name, phone, note, is_active, created_at
	`, storeID, name, phone, note).Scan(
		&s.ID, &s.StoreID, &s.Name, &s.Phone, &s.Note, &s.IsActive, &s.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SupplierRepo) Update(ctx context.Context, storeID, id uuid.UUID, name, phone, note string) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE suppliers SET name = $3, phone = $4, note = $5, updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, id, storeID, name, phone, note)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrSupplierNotFound
	}
	return nil
}

func (r *SupplierRepo) SoftDelete(ctx context.Context, storeID, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE suppliers SET is_active = false, updated_at = now() WHERE id = $1 AND store_id = $2`,
		id, storeID)
	return err
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

type PurchaseOrder struct {
	ID           uuid.UUID
	StoreID      uuid.UUID
	SupplierID   *uuid.UUID
	SupplierName string // joined
	Status       string
	Note         string
	TotalCents   int64
	ItemCount    int // joined
	OrderedAt    *time.Time
	ReceivedAt   *time.Time
	CreatedAt    time.Time
}

type POItem struct {
	ID            uuid.UUID
	MaterialID    uuid.UUID
	MaterialName  string // joined
	BaseUnit      string // joined
	Quantity      int64
	UnitCostCents int64
}

type POItemInput struct {
	MaterialID    uuid.UUID
	Quantity      int64
	UnitCostCents int64
}

type PurchaseOrderRepo struct {
	pool *pgxpool.Pool
}

func NewPurchaseOrderRepo(pool *pgxpool.Pool) *PurchaseOrderRepo {
	return &PurchaseOrderRepo{pool: pool}
}

func (r *PurchaseOrderRepo) ListByStore(ctx context.Context, storeID uuid.UUID, status string) ([]PurchaseOrder, error) {
	q := `
		SELECT po.id, po.store_id, po.supplier_id, COALESCE(s.name, ''), po.status, po.note,
		       po.total_cents, po.ordered_at, po.received_at, po.created_at,
		       (SELECT count(*) FROM purchase_order_items WHERE po_id = po.id)
		FROM purchase_orders po
		LEFT JOIN suppliers s ON s.id = po.supplier_id
		WHERE po.store_id = $1`
	args := []any{storeID}
	if status != "" {
		q += ` AND po.status = $2`
		args = append(args, status)
	}
	q += ` ORDER BY po.created_at DESC LIMIT 200`
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PurchaseOrder
	for rows.Next() {
		var p PurchaseOrder
		if err := rows.Scan(&p.ID, &p.StoreID, &p.SupplierID, &p.SupplierName, &p.Status, &p.Note,
			&p.TotalCents, &p.OrderedAt, &p.ReceivedAt, &p.CreatedAt, &p.ItemCount); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PurchaseOrderRepo) Get(ctx context.Context, storeID, id uuid.UUID) (*PurchaseOrder, []POItem, error) {
	var p PurchaseOrder
	err := r.pool.QueryRow(ctx, `
		SELECT po.id, po.store_id, po.supplier_id, COALESCE(s.name, ''), po.status, po.note,
		       po.total_cents, po.ordered_at, po.received_at, po.created_at
		FROM purchase_orders po
		LEFT JOIN suppliers s ON s.id = po.supplier_id
		WHERE po.id = $1 AND po.store_id = $2
	`, id, storeID).Scan(&p.ID, &p.StoreID, &p.SupplierID, &p.SupplierName, &p.Status, &p.Note,
		&p.TotalCents, &p.OrderedAt, &p.ReceivedAt, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrPONotFound
	}
	if err != nil {
		return nil, nil, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT poi.id, poi.material_id, m.name, m.base_unit, poi.quantity, poi.unit_cost_cents
		FROM purchase_order_items poi
		JOIN materials m ON m.id = poi.material_id
		WHERE poi.po_id = $1
		ORDER BY m.name
	`, id)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var items []POItem
	for rows.Next() {
		var it POItem
		if err := rows.Scan(&it.ID, &it.MaterialID, &it.MaterialName, &it.BaseUnit, &it.Quantity, &it.UnitCostCents); err != nil {
			return nil, nil, err
		}
		items = append(items, it)
	}
	return &p, items, rows.Err()
}

// Create inserts a draft PO with its items. total_cents = Σ qty × unit_cost.
func (r *PurchaseOrderRepo) Create(ctx context.Context, storeID uuid.UUID, supplierID *uuid.UUID, note string, items []POItemInput) (uuid.UUID, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var total int64
	for _, it := range items {
		if it.Quantity > 0 {
			total += it.Quantity * it.UnitCostCents
		}
	}
	var poID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO purchase_orders (store_id, supplier_id, note, total_cents)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, storeID, supplierID, strings.TrimSpace(note), total).Scan(&poID); err != nil {
		return uuid.Nil, err
	}
	for _, it := range items {
		if it.Quantity <= 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO purchase_order_items (po_id, material_id, quantity, unit_cost_cents)
			VALUES ($1, $2, $3, $4)
		`, poID, it.MaterialID, it.Quantity, it.UnitCostCents); err != nil {
			return uuid.Nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return poID, nil
}

// SetStatus moves draft↔ordered or cancels (not for 'received' — use Receive).
func (r *PurchaseOrderRepo) SetStatus(ctx context.Context, storeID, id uuid.UUID, status string) error {
	if status != "ordered" && status != "draft" && status != "cancelled" {
		return errors.New("status tidak valid")
	}
	stampCol := ""
	if status == "ordered" {
		stampCol = ", ordered_at = now()"
	}
	ct, err := r.pool.Exec(ctx, `
		UPDATE purchase_orders SET status = $3`+stampCol+`, updated_at = now()
		WHERE id = $1 AND store_id = $2 AND status IN ('draft','ordered')
	`, id, storeID, status)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrPONotReceivable
	}
	return nil
}

// Receive marks a PO received and restocks every material in ONE tx: bumps
// stock + refreshes cost + writes a 'restock' movement (the cash-flow report
// reads these restock movements as money-out). Idempotent guard: only from
// draft/ordered.
func (r *PurchaseOrderRepo) Receive(ctx context.Context, storeID, id uuid.UUID) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var status, note string
	if err := tx.QueryRow(ctx,
		`SELECT status, note FROM purchase_orders WHERE id = $1 AND store_id = $2 FOR UPDATE`,
		id, storeID).Scan(&status, &note); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrPONotFound
		}
		return err
	}
	if status != "draft" && status != "ordered" {
		return ErrPONotReceivable
	}

	rows, err := tx.Query(ctx,
		`SELECT material_id, quantity, unit_cost_cents FROM purchase_order_items WHERE po_id = $1`, id)
	if err != nil {
		return err
	}
	type line struct {
		matID uuid.UUID
		qty   int64
		cost  int64
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.matID, &l.qty, &l.cost); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, l := range lines {
		// Restock + refresh cost (store-scoped). Skip silently if the material
		// was removed.
		ct, err := tx.Exec(ctx, `
			UPDATE materials SET stock = stock + $3, cost_cents = $4, updated_at = now()
			WHERE id = $1 AND store_id = $2
		`, l.matID, storeID, l.qty, l.cost)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO material_movements (store_id, material_id, movement_type, quantity, unit_cost_cents, note)
			VALUES ($1, $2, 'restock', $3, $4, $5)
		`, storeID, l.matID, l.qty, l.cost, "Terima PO"); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE purchase_orders SET status = 'received', received_at = now(), updated_at = now() WHERE id = $1 AND store_id = $2`,
		id, storeID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
