package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrMaterialNotFound = errors.New("material not found")

// Material is a store-level raw-material / packaging inventory item. Stock is
// an integer in base_unit (gram/ml/pcs) and MAY go negative — material stock
// is soft and never blocks a sale. cost_cents is the modal per 1 base_unit.
type Material struct {
	ID                uuid.UUID
	StoreID           uuid.UUID
	Name              string
	Kind              string // "ingredient" | "packaging"
	BaseUnit          string
	CostCents         int64
	Stock             int64
	LowStockThreshold int64
	IsActive          bool
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type MaterialMovement struct {
	ID            uuid.UUID
	MaterialID    uuid.UUID
	MovementType  string // "restock" | "consume" | "adjust"
	Quantity      int64  // signed: +restock, -consume
	UnitCostCents int64
	OrderID       *uuid.UUID
	Note          string
	CreatedAt     time.Time
}

type MaterialInput struct {
	Name              string
	Kind              string
	BaseUnit          string
	CostCents         int64
	LowStockThreshold int64
}

type MaterialRepo struct {
	pool *pgxpool.Pool
}

func NewMaterialRepo(pool *pgxpool.Pool) *MaterialRepo {
	return &MaterialRepo{pool: pool}
}

const materialCols = `id, store_id, name, kind, base_unit, cost_cents, stock,
	low_stock_threshold, is_active, created_at, updated_at`

func scanMaterial(row pgx.Row) (*Material, error) {
	var m Material
	err := row.Scan(&m.ID, &m.StoreID, &m.Name, &m.Kind, &m.BaseUnit, &m.CostCents,
		&m.Stock, &m.LowStockThreshold, &m.IsActive, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// NamesByIDs returns a map of material id → name for the given ids, scoped to
// the store. Used to label take-away packaging lines without an N+1.
func (r *MaterialRepo) NamesByIDs(ctx context.Context, storeID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	out := map[uuid.UUID]string{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, name FROM materials WHERE store_id = $1 AND id = ANY($2)`, storeID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}

type InventorySummary struct {
	ItemCount       int
	TotalValueCents int64
	LowStockCount   int
}

// Summary returns inventory valuation (Σ stock×cost, negative stock floored at
// 0) + counts for the materials dashboard header.
func (r *MaterialRepo) Summary(ctx context.Context, storeID uuid.UUID) (*InventorySummary, error) {
	var s InventorySummary
	err := r.pool.QueryRow(ctx, `
		SELECT count(*),
		       COALESCE(SUM(GREATEST(stock, 0) * cost_cents), 0),
		       count(*) FILTER (WHERE low_stock_threshold > 0 AND stock <= low_stock_threshold)
		FROM materials
		WHERE store_id = $1 AND is_active = true
	`, storeID).Scan(&s.ItemCount, &s.TotalValueCents, &s.LowStockCount)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

type MaterialListFilter struct {
	StoreID         uuid.UUID
	Search          string // name substring (ILIKE)
	Sort            string // "name" (default) | "stock_asc" | "stock_desc"
	IncludeInactive bool
	LowStockOnly    bool
	Limit           int
	Offset          int
}

// ListByStore returns a page of materials matching the filter plus the total
// row count (for pagination). Low-stock = stock <= threshold AND threshold > 0
// (always flags negative stock too).
func (r *MaterialRepo) ListByStore(ctx context.Context, f MaterialListFilter) ([]Material, int, error) {
	clauses := []string{"store_id = $1"}
	args := []any{f.StoreID}
	pos := 2
	if !f.IncludeInactive {
		clauses = append(clauses, "is_active = true")
	}
	if f.LowStockOnly {
		clauses = append(clauses, "low_stock_threshold > 0 AND stock <= low_stock_threshold")
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		clauses = append(clauses, fmt.Sprintf("name ILIKE $%d", pos))
		args = append(args, "%"+s+"%")
		pos++
	}
	where := strings.Join(clauses, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM materials WHERE `+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	order := "kind, name"
	switch f.Sort {
	case "stock_asc":
		order = "stock ASC, name"
	case "stock_desc":
		order = "stock DESC, name"
	}

	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 20
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}
	q := fmt.Sprintf(
		`SELECT %s FROM materials WHERE %s ORDER BY %s LIMIT $%d OFFSET $%d`,
		materialCols, where, order, pos, pos+1,
	)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Material
	for rows.Next() {
		m, err := scanMaterial(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *m)
	}
	return out, total, rows.Err()
}

func (r *MaterialRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Material, error) {
	m, err := scanMaterial(r.pool.QueryRow(ctx,
		`SELECT `+materialCols+` FROM materials WHERE id = $1 AND store_id = $2`, id, storeID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMaterialNotFound
	}
	return m, err
}

func (r *MaterialRepo) Create(ctx context.Context, storeID uuid.UUID, in MaterialInput) (*Material, error) {
	return scanMaterial(r.pool.QueryRow(ctx, `
		INSERT INTO materials (store_id, name, kind, base_unit, cost_cents, low_stock_threshold)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING `+materialCols,
		storeID, strings.TrimSpace(in.Name), in.Kind, strings.TrimSpace(in.BaseUnit),
		in.CostCents, in.LowStockThreshold,
	))
}

// Update patches the editable fields (not stock — stock changes go through
// Restock/Adjust so they leave a ledger trail).
func (r *MaterialRepo) Update(ctx context.Context, storeID, id uuid.UUID, in MaterialInput) (*Material, error) {
	m, err := scanMaterial(r.pool.QueryRow(ctx, `
		UPDATE materials
		SET name = $3, kind = $4, base_unit = $5, cost_cents = $6,
		    low_stock_threshold = $7, updated_at = now()
		WHERE id = $1 AND store_id = $2
		RETURNING `+materialCols,
		id, storeID, strings.TrimSpace(in.Name), in.Kind, strings.TrimSpace(in.BaseUnit),
		in.CostCents, in.LowStockThreshold,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMaterialNotFound
	}
	return m, err
}

// Restock adds `qty` to stock and records a 'restock' movement. If newCost is
// non-nil the material's cost_cents is updated first; the movement snapshots
// whatever the cost is at that moment.
func (r *MaterialRepo) Restock(ctx context.Context, storeID, id uuid.UUID, qty int64, newCost *int64, note string) (*Material, error) {
	if qty <= 0 {
		return nil, errors.New("jumlah restock harus > 0")
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Lock the row + confirm tenant ownership.
	var cost int64
	err = tx.QueryRow(ctx,
		`SELECT cost_cents FROM materials WHERE id = $1 AND store_id = $2 FOR UPDATE`,
		id, storeID).Scan(&cost)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMaterialNotFound
	}
	if err != nil {
		return nil, err
	}
	if newCost != nil && *newCost >= 0 {
		cost = *newCost
	}
	if _, err := tx.Exec(ctx, `
		UPDATE materials SET stock = stock + $3, cost_cents = $4, updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, id, storeID, qty, cost); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO material_movements (store_id, material_id, movement_type, quantity, unit_cost_cents, note)
		VALUES ($1, $2, 'restock', $3, $4, $5)
	`, storeID, id, qty, cost, strings.TrimSpace(note)); err != nil {
		return nil, err
	}
	m, err := scanMaterial(tx.QueryRow(ctx,
		`SELECT `+materialCols+` FROM materials WHERE id = $1 AND store_id = $2`, id, storeID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return m, nil
}

// Adjust sets stock to an absolute value, recording the delta as an 'adjust'
// movement (for manual stock-opname corrections).
func (r *MaterialRepo) Adjust(ctx context.Context, storeID, id uuid.UUID, newStock int64, note string) (*Material, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var cur, cost int64
	err = tx.QueryRow(ctx,
		`SELECT stock, cost_cents FROM materials WHERE id = $1 AND store_id = $2 FOR UPDATE`,
		id, storeID).Scan(&cur, &cost)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMaterialNotFound
	}
	if err != nil {
		return nil, err
	}
	delta := newStock - cur
	if _, err := tx.Exec(ctx, `
		UPDATE materials SET stock = $3, updated_at = now() WHERE id = $1 AND store_id = $2
	`, id, storeID, newStock); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO material_movements (store_id, material_id, movement_type, quantity, unit_cost_cents, note)
		VALUES ($1, $2, 'adjust', $3, $4, $5)
	`, storeID, id, delta, cost, strings.TrimSpace(note)); err != nil {
		return nil, err
	}
	m, err := scanMaterial(tx.QueryRow(ctx,
		`SELECT `+materialCols+` FROM materials WHERE id = $1 AND store_id = $2`, id, storeID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return m, nil
}

// SoftDelete marks a material inactive. Hard delete is intentionally not
// exposed — material_movements cascades, which would erase consumption history.
func (r *MaterialRepo) SoftDelete(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE materials SET is_active = false, updated_at = now() WHERE id = $1 AND store_id = $2`,
		id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMaterialNotFound
	}
	return nil
}

// === Consumption report ===

type MaterialConsumptionRow struct {
	MaterialID uuid.UUID
	Name       string
	BaseUnit   string
	Kind       string
	Qty        int64 // total consumed in the period (positive)
	CostCents  int64 // total cost (qty × snapshot cost)
}

type MaterialConsumptionDaily struct {
	Date      string // YYYY-MM-DD (WIB)
	CostCents int64
}

type MaterialConsumptionReport struct {
	TotalCostCents int64
	ByMaterial     []MaterialConsumptionRow
	DailySeries    []MaterialConsumptionDaily
}

// GetConsumptionReport aggregates the 'consume' ledger over [from, to) into
// per-material totals (qty + cost) and a daily cost series (WIB buckets).
func (r *MaterialRepo) GetConsumptionReport(ctx context.Context, storeID uuid.UUID, from, to time.Time) (*MaterialConsumptionReport, error) {
	out := &MaterialConsumptionReport{}

	byMat, err := r.pool.Query(ctx, `
		SELECT m.id, m.name, m.base_unit, m.kind,
		       COALESCE(SUM(-mm.quantity), 0)                       AS qty,
		       COALESCE(SUM(-mm.quantity * mm.unit_cost_cents), 0)  AS cost
		FROM material_movements mm
		JOIN materials m ON m.id = mm.material_id
		WHERE mm.store_id = $1 AND mm.movement_type = 'consume'
		  AND mm.created_at >= $2 AND mm.created_at < $3
		GROUP BY m.id, m.name, m.base_unit, m.kind
		ORDER BY cost DESC, qty DESC
	`, storeID, from, to)
	if err != nil {
		return nil, err
	}
	defer byMat.Close()
	for byMat.Next() {
		var row MaterialConsumptionRow
		if err := byMat.Scan(&row.MaterialID, &row.Name, &row.BaseUnit, &row.Kind, &row.Qty, &row.CostCents); err != nil {
			return nil, err
		}
		out.ByMaterial = append(out.ByMaterial, row)
		out.TotalCostCents += row.CostCents
	}
	if err := byMat.Err(); err != nil {
		return nil, err
	}

	daily, err := r.pool.Query(ctx, `
		SELECT TO_CHAR(date_trunc('day', mm.created_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS day,
		       COALESCE(SUM(-mm.quantity * mm.unit_cost_cents), 0) AS cost
		FROM material_movements mm
		WHERE mm.store_id = $1 AND mm.movement_type = 'consume'
		  AND mm.created_at >= $2 AND mm.created_at < $3
		GROUP BY day
		ORDER BY day ASC
	`, storeID, from, to)
	if err != nil {
		return nil, err
	}
	defer daily.Close()
	for daily.Next() {
		var d MaterialConsumptionDaily
		if err := daily.Scan(&d.Date, &d.CostCents); err != nil {
			return nil, err
		}
		out.DailySeries = append(out.DailySeries, d)
	}
	return out, daily.Err()
}

// ListMovements returns the recent ledger for one material (newest first).
func (r *MaterialRepo) ListMovements(ctx context.Context, storeID, materialID uuid.UUID, limit int) ([]MaterialMovement, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, material_id, movement_type, quantity, unit_cost_cents, order_id, note, created_at
		FROM material_movements
		WHERE store_id = $1 AND material_id = $2
		ORDER BY created_at DESC
		LIMIT $3
	`, storeID, materialID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MaterialMovement
	for rows.Next() {
		var m MaterialMovement
		if err := rows.Scan(&m.ID, &m.MaterialID, &m.MovementType, &m.Quantity,
			&m.UnitCostCents, &m.OrderID, &m.Note, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
