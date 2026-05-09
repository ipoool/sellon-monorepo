package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Variant struct {
	ID         uuid.UUID
	ProductID  uuid.UUID
	Name       string
	SKU        string
	PriceCents int64
	Stock      int
	SortOrder  int
	CreatedAt  time.Time
}

type VariantRepo struct {
	pool *pgxpool.Pool
}

func NewVariantRepo(pool *pgxpool.Pool) *VariantRepo {
	return &VariantRepo{pool: pool}
}

// VariantAggregate is a per-product roll-up of its variants. Used by the
// dashboard product list to surface "N varian · stok M" without an N+1.
type VariantAggregate struct {
	Count      int
	StockTotal int
}

// AggregateByProducts returns count + summed stock per product for the given
// product IDs. Products without any variants are simply absent from the map.
func (r *VariantRepo) AggregateByProducts(ctx context.Context, productIDs []uuid.UUID) (map[uuid.UUID]VariantAggregate, error) {
	if len(productIDs) == 0 {
		return map[uuid.UUID]VariantAggregate{}, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT product_id, COUNT(*)::int, COALESCE(SUM(stock), 0)::int
		FROM product_variants
		WHERE product_id = ANY($1)
		GROUP BY product_id
	`, productIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[uuid.UUID]VariantAggregate, len(productIDs))
	for rows.Next() {
		var pid uuid.UUID
		var agg VariantAggregate
		if err := rows.Scan(&pid, &agg.Count, &agg.StockTotal); err != nil {
			return nil, err
		}
		out[pid] = agg
	}
	return out, rows.Err()
}

func (r *VariantRepo) ListByProduct(ctx context.Context, productID uuid.UUID) ([]Variant, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, name, sku, price_cents, stock, sort_order, created_at
		FROM product_variants
		WHERE product_id = $1
		ORDER BY sort_order ASC, created_at ASC
	`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Variant
	for rows.Next() {
		var v Variant
		if err := rows.Scan(
			&v.ID, &v.ProductID, &v.Name, &v.SKU, &v.PriceCents, &v.Stock, &v.SortOrder, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// FindByID looks up a single variant — used to validate ownership at order
// creation. Caller must verify the variant.product_id matches the ordered
// product.
func (r *VariantRepo) FindByID(ctx context.Context, id uuid.UUID) (*Variant, error) {
	const q = `
		SELECT id, product_id, name, sku, price_cents, stock, sort_order, created_at
		FROM product_variants WHERE id = $1
	`
	var v Variant
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&v.ID, &v.ProductID, &v.Name, &v.SKU, &v.PriceCents, &v.Stock, &v.SortOrder, &v.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("variant not found")
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}

type VariantInput struct {
	ID         string // empty = new; UUID = update existing
	Name       string
	SKU        string
	PriceCents int64
	Stock      int
	SortOrder  int
}

// ReplaceForProduct does a destructive sync: any rows in product_variants for
// the given product that aren't in `inputs` are deleted; remaining inputs are
// upserted. Sets products.has_variants based on len(inputs) > 0.
//
// Runs in a single transaction.
func (r *VariantRepo) ReplaceForProduct(ctx context.Context, productID uuid.UUID, inputs []VariantInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Collect IDs from inputs that already exist (have a parsable UUID)
	keepIDs := make([]uuid.UUID, 0, len(inputs))
	for _, in := range inputs {
		if in.ID != "" {
			if id, err := uuid.Parse(in.ID); err == nil {
				keepIDs = append(keepIDs, id)
			}
		}
	}

	// Delete rows not in keepIDs
	if len(keepIDs) == 0 {
		if _, err := tx.Exec(ctx,
			`DELETE FROM product_variants WHERE product_id = $1`, productID,
		); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(ctx,
			`DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2))`,
			productID, keepIDs,
		); err != nil {
			return err
		}
	}

	// Upsert
	for _, in := range inputs {
		if in.ID != "" {
			id, err := uuid.Parse(in.ID)
			if err != nil {
				continue
			}
			if _, err := tx.Exec(ctx, `
				UPDATE product_variants
				SET name = $3, sku = $4, price_cents = $5, stock = $6, sort_order = $7
				WHERE id = $1 AND product_id = $2
			`, id, productID, in.Name, in.SKU, in.PriceCents, in.Stock, in.SortOrder); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				INSERT INTO product_variants (product_id, name, sku, price_cents, stock, sort_order)
				VALUES ($1, $2, $3, $4, $5, $6)
			`, productID, in.Name, in.SKU, in.PriceCents, in.Stock, in.SortOrder); err != nil {
				return err
			}
		}
	}

	// Update has_variants flag on the parent product
	if _, err := tx.Exec(ctx, `
		UPDATE products SET has_variants = $2, updated_at = now()
		WHERE id = $1
	`, productID, len(inputs) > 0); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
