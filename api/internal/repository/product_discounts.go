package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProductDiscount adalah tier diskon volume per produk: "beli minimal N qty,
// dapat diskon X% atau Rp Y". Dibatasi periode jika starts_at/ends_at terisi.
type ProductDiscount struct {
	ID            uuid.UUID
	ProductID     uuid.UUID
	MinQuantity   int
	DiscountType  string // "percent" | "fixed"
	DiscountValue int64  // percent (0-100) atau cents
	StartsAt      *time.Time
	EndsAt        *time.Time
	IsActive      bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type ProductDiscountInput struct {
	MinQuantity   int
	DiscountType  string
	DiscountValue int64
	StartsAt      *time.Time
	EndsAt        *time.Time
	IsActive      bool
}

type ProductDiscountRepo struct {
	pool *pgxpool.Pool
}

func NewProductDiscountRepo(pool *pgxpool.Pool) *ProductDiscountRepo {
	return &ProductDiscountRepo{pool: pool}
}

func (r *ProductDiscountRepo) ListByProduct(ctx context.Context, productID uuid.UUID) ([]ProductDiscount, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, min_quantity, discount_type, discount_value,
		       starts_at, ends_at, is_active, created_at, updated_at
		FROM product_discounts
		WHERE product_id = $1
		ORDER BY min_quantity ASC
	`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProductDiscount
	for rows.Next() {
		var d ProductDiscount
		if err := rows.Scan(&d.ID, &d.ProductID, &d.MinQuantity, &d.DiscountType, &d.DiscountValue,
			&d.StartsAt, &d.EndsAt, &d.IsActive, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListActiveForProducts returns currently-applicable tier discounts (is_active +
// within date window) for a set of product IDs. Used by POS to auto-apply.
func (r *ProductDiscountRepo) ListActiveForProducts(ctx context.Context, productIDs []uuid.UUID) (map[uuid.UUID][]ProductDiscount, error) {
	if len(productIDs) == 0 {
		return map[uuid.UUID][]ProductDiscount{}, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, min_quantity, discount_type, discount_value,
		       starts_at, ends_at, is_active, created_at, updated_at
		FROM product_discounts
		WHERE product_id = ANY($1)
		  AND is_active = true
		  AND (starts_at IS NULL OR starts_at <= now())
		  AND (ends_at   IS NULL OR ends_at   >= now())
		ORDER BY product_id, min_quantity ASC
	`, productIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID][]ProductDiscount{}
	for rows.Next() {
		var d ProductDiscount
		if err := rows.Scan(&d.ID, &d.ProductID, &d.MinQuantity, &d.DiscountType, &d.DiscountValue,
			&d.StartsAt, &d.EndsAt, &d.IsActive, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out[d.ProductID] = append(out[d.ProductID], d)
	}
	return out, rows.Err()
}

// Replace nukes existing discounts for a product and inserts the new list.
// Cleaner UX than diff-based update — discount lists are small (typically <5
// rows per product).
func (r *ProductDiscountRepo) Replace(ctx context.Context, productID uuid.UUID, inputs []ProductDiscountInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM product_discounts WHERE product_id = $1`, productID); err != nil {
		return err
	}
	for _, in := range inputs {
		if in.MinQuantity < 1 {
			continue
		}
		if in.DiscountType != "percent" && in.DiscountType != "fixed" {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO product_discounts
			    (product_id, min_quantity, discount_type, discount_value,
			     starts_at, ends_at, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, productID, in.MinQuantity, in.DiscountType, in.DiscountValue,
			in.StartsAt, in.EndsAt, in.IsActive); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
