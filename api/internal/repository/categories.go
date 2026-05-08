package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Category struct {
	ID         uuid.UUID
	StoreID    uuid.UUID
	Name       string
	SortOrder  int
	CreatedAt  time.Time
	ProductCount int // computed when needed
}

type CategoryRepo struct {
	pool *pgxpool.Pool
}

func NewCategoryRepo(pool *pgxpool.Pool) *CategoryRepo {
	return &CategoryRepo{pool: pool}
}

var ErrCategoryNotFound = errors.New("category not found")

func (r *CategoryRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]Category, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.store_id, c.name, c.sort_order, c.created_at,
		       COALESCE(p.cnt, 0) AS product_count
		FROM product_categories c
		LEFT JOIN (
		    SELECT category_id, COUNT(*) AS cnt
		    FROM products
		    WHERE store_id = $1
		    GROUP BY category_id
		) p ON p.category_id = c.id
		WHERE c.store_id = $1
		ORDER BY c.sort_order ASC, c.name ASC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(
			&c.ID, &c.StoreID, &c.Name, &c.SortOrder, &c.CreatedAt, &c.ProductCount,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *CategoryRepo) Create(ctx context.Context, storeID uuid.UUID, name string) (*Category, error) {
	var c Category
	err := r.pool.QueryRow(ctx, `
		INSERT INTO product_categories (store_id, name, sort_order)
		VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM product_categories WHERE store_id = $1), 0))
		RETURNING id, store_id, name, sort_order, created_at
	`, storeID, name).Scan(&c.ID, &c.StoreID, &c.Name, &c.SortOrder, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CategoryRepo) Rename(ctx context.Context, storeID, id uuid.UUID, name string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE product_categories SET name = $3
		WHERE id = $1 AND store_id = $2
	`, id, storeID, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCategoryNotFound
	}
	return nil
}

func (r *CategoryRepo) Delete(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM product_categories WHERE id = $1 AND store_id = $2`,
		id, storeID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCategoryNotFound
	}
	return nil
}

// FindByID returns a single category — used to validate ownership.
func (r *CategoryRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Category, error) {
	var c Category
	err := r.pool.QueryRow(ctx, `
		SELECT id, store_id, name, sort_order, created_at
		FROM product_categories
		WHERE id = $1 AND store_id = $2
	`, id, storeID).Scan(&c.ID, &c.StoreID, &c.Name, &c.SortOrder, &c.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCategoryNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}
