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

type Product struct {
	ID                uuid.UUID
	StoreID           uuid.UUID
	CategoryID        *uuid.UUID
	Name              string
	Slug              string
	Description       string
	PriceCents        int64
	Stock             int
	LowStockThreshold int
	WeightG           int
	LengthCm          int
	WidthCm           int
	HeightCm          int
	Status            string
	PhotoURLs         []string
	HasVariants       bool
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type ProductRepo struct {
	pool *pgxpool.Pool
}

func NewProductRepo(pool *pgxpool.Pool) *ProductRepo {
	return &ProductRepo{pool: pool}
}

var ErrProductNotFound = errors.New("product not found")

const productColumns = `id, store_id, category_id, name, slug, description, price_cents, stock,
	low_stock_threshold, weight_g, length_cm, width_cm, height_cm,
	status, photo_urls, has_variants, created_at, updated_at`

func scanProduct(row pgx.Row, p *Product) error {
	return row.Scan(
		&p.ID, &p.StoreID, &p.CategoryID, &p.Name, &p.Slug, &p.Description,
		&p.PriceCents, &p.Stock, &p.LowStockThreshold,
		&p.WeightG, &p.LengthCm, &p.WidthCm, &p.HeightCm,
		&p.Status, &p.PhotoURLs, &p.HasVariants, &p.CreatedAt, &p.UpdatedAt,
	)
}

type ListProductsFilter struct {
	StoreID uuid.UUID
	Search  string
	Status  string // "" for all
	Limit   int
	Offset  int
}

func (r *ProductRepo) List(ctx context.Context, f ListProductsFilter) ([]Product, int, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	whereClauses := []string{"store_id = $1"}
	args := []any{f.StoreID}
	if f.Search != "" {
		args = append(args, "%"+f.Search+"%")
		whereClauses = append(whereClauses, "name ILIKE $"+itoa(len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		whereClauses = append(whereClauses, "status = $"+itoa(len(args)))
	}
	where := strings.Join(whereClauses, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM products WHERE "+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, f.Limit, f.Offset)
	rows, err := r.pool.Query(ctx, `
		SELECT `+productColumns+`
		FROM products
		WHERE `+where+`
		ORDER BY created_at DESC
		LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)),
		args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []Product
	for rows.Next() {
		var p Product
		if err := scanProduct(rows, &p); err != nil {
			return nil, 0, err
		}
		out = append(out, p)
	}
	return out, total, rows.Err()
}

// ListActiveByStore returns active products for storefront display (public).
func (r *ProductRepo) ListActiveByStore(ctx context.Context, storeID uuid.UUID) ([]Product, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+productColumns+`
		FROM products
		WHERE store_id = $1 AND status = 'active'
		ORDER BY created_at DESC
		LIMIT 200
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Product
	for rows.Next() {
		var p Product
		if err := scanProduct(rows, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *ProductRepo) FindBySlug(ctx context.Context, storeID uuid.UUID, slug string) (*Product, error) {
	q := `SELECT ` + productColumns + ` FROM products WHERE store_id = $1 AND slug = $2`
	var p Product
	if err := scanProduct(r.pool.QueryRow(ctx, q, storeID, slug), &p); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *ProductRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Product, error) {
	q := `SELECT ` + productColumns + ` FROM products WHERE id = $1 AND store_id = $2`
	var p Product
	if err := scanProduct(r.pool.QueryRow(ctx, q, id, storeID), &p); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	return &p, nil
}

type SaveProductInput struct {
	StoreID           uuid.UUID
	CategoryID        *uuid.UUID
	Name              string
	Slug              string
	Description       string
	PriceCents        int64
	Stock             int
	LowStockThreshold int
	WeightG           int
	LengthCm          int
	WidthCm           int
	HeightCm          int
	Status            string
	PhotoURLs         []string
}

func (r *ProductRepo) Create(ctx context.Context, in SaveProductInput) (*Product, error) {
	q := `
		INSERT INTO products (store_id, category_id, name, slug, description, price_cents, stock,
		                     low_stock_threshold,
		                     weight_g, length_cm, width_cm, height_cm, status, photo_urls)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING ` + productColumns
	var p Product
	if err := scanProduct(r.pool.QueryRow(ctx, q,
		in.StoreID, in.CategoryID, in.Name, in.Slug, in.Description, in.PriceCents, in.Stock,
		in.LowStockThreshold,
		in.WeightG, in.LengthCm, in.WidthCm, in.HeightCm, in.Status, in.PhotoURLs,
	), &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProductRepo) Update(ctx context.Context, id uuid.UUID, in SaveProductInput) (*Product, error) {
	q := `
		UPDATE products
		SET category_id = $3,
		    name = $4, slug = $5, description = $6, price_cents = $7, stock = $8,
		    low_stock_threshold = $9,
		    weight_g = $10, length_cm = $11, width_cm = $12, height_cm = $13,
		    status = $14, photo_urls = $15, updated_at = now()
		WHERE id = $1 AND store_id = $2
		RETURNING ` + productColumns
	var p Product
	if err := scanProduct(r.pool.QueryRow(ctx, q,
		id, in.StoreID, in.CategoryID, in.Name, in.Slug, in.Description, in.PriceCents, in.Stock,
		in.LowStockThreshold,
		in.WeightG, in.LengthCm, in.WidthCm, in.HeightCm, in.Status, in.PhotoURLs,
	), &p); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *ProductRepo) Delete(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM products WHERE id = $1 AND store_id = $2", id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrProductNotFound
	}
	return nil
}

// CountByStatus returns map of status → count for a store. Used on dasbor home.
func (r *ProductRepo) CountByStatus(ctx context.Context, storeID uuid.UUID) (map[string]int, error) {
	rows, err := r.pool.Query(ctx,
		"SELECT status, COUNT(*) FROM products WHERE store_id = $1 GROUP BY status",
		storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		out[status] = count
	}
	return out, rows.Err()
}

// CountLowStock returns the number of active products whose stock has dropped
// to or below their per-product threshold (0 = alert disabled).
func (r *ProductRepo) CountLowStock(ctx context.Context, storeID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM products
		WHERE store_id = $1
		  AND status = 'active'
		  AND low_stock_threshold > 0
		  AND stock <= low_stock_threshold
	`, storeID).Scan(&n)
	return n, err
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := [20]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
