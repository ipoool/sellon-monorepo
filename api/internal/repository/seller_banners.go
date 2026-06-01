package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSellerBannerNotFound = errors.New("seller banner not found")

// Valid placements for a seller banner. Mirrors the CHECK constraint in
// migration 0083 and the frontend placement picker.
var SellerBannerPlacements = []string{"storefront", "table_order", "customer_queue"}

func IsValidBannerPlacement(p string) bool {
	for _, v := range SellerBannerPlacements {
		if v == p {
			return true
		}
	}
	return false
}

// SellerBanner is a per-store promo image for a specific placement.
type SellerBanner struct {
	ID        uuid.UUID
	StoreID   uuid.UUID
	Placement string
	ImageURL  string
	ImagePath string
	Title     string
	LinkURL   string
	IsActive  bool
	SortOrder int
	CreatedAt time.Time
	UpdatedAt time.Time
}

type SellerBannerRepo struct {
	pool *pgxpool.Pool
}

func NewSellerBannerRepo(pool *pgxpool.Pool) *SellerBannerRepo {
	return &SellerBannerRepo{pool: pool}
}

const sellerBannerCols = `id, store_id, placement, image_url, image_path, title, link_url, is_active, sort_order, created_at, updated_at`

func scanSellerBanner(row pgx.Row) (*SellerBanner, error) {
	var b SellerBanner
	if err := row.Scan(
		&b.ID, &b.StoreID, &b.Placement, &b.ImageURL, &b.ImagePath,
		&b.Title, &b.LinkURL, &b.IsActive, &b.SortOrder, &b.CreatedAt, &b.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *SellerBannerRepo) query(ctx context.Context, sql string, args ...any) ([]SellerBanner, error) {
	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SellerBanner{}
	for rows.Next() {
		b, err := scanSellerBanner(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

// ListByStore returns every banner for a store (management view), grouped by
// placement then display order.
func (r *SellerBannerRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]SellerBanner, error) {
	return r.query(ctx, `SELECT `+sellerBannerCols+`
		FROM seller_banners WHERE store_id = $1
		ORDER BY placement ASC, sort_order ASC, created_at DESC`, storeID)
}

// ListActiveByStore returns only active banners for a store (public display),
// the caller groups them by placement.
func (r *SellerBannerRepo) ListActiveByStore(ctx context.Context, storeID uuid.UUID) ([]SellerBanner, error) {
	return r.query(ctx, `SELECT `+sellerBannerCols+`
		FROM seller_banners WHERE store_id = $1 AND is_active = true
		ORDER BY placement ASC, sort_order ASC, created_at DESC`, storeID)
}

type SellerBannerInput struct {
	StoreID   uuid.UUID
	Placement string
	ImageURL  string
	ImagePath string
	Title     string
	LinkURL   string
	SortOrder int
}

func (r *SellerBannerRepo) Create(ctx context.Context, in SellerBannerInput) (*SellerBanner, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO seller_banners (store_id, placement, image_url, image_path, title, link_url, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+sellerBannerCols,
		in.StoreID, in.Placement, in.ImageURL, in.ImagePath, in.Title, in.LinkURL, in.SortOrder)
	return scanSellerBanner(row)
}

type SellerBannerUpdate struct {
	Title     string
	LinkURL   string
	IsActive  bool
	SortOrder int
}

// Update is store-scoped — the WHERE clause prevents cross-tenant edits.
func (r *SellerBannerRepo) Update(ctx context.Context, id, storeID uuid.UUID, in SellerBannerUpdate) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE seller_banners
		SET title = $3, link_url = $4, is_active = $5, sort_order = $6, updated_at = now()
		WHERE id = $1 AND store_id = $2`,
		id, storeID, in.Title, in.LinkURL, in.IsActive, in.SortOrder)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrSellerBannerNotFound
	}
	return nil
}

// Delete is store-scoped and returns the deleted row for storage cleanup.
func (r *SellerBannerRepo) Delete(ctx context.Context, id, storeID uuid.UUID) (*SellerBanner, error) {
	row := r.pool.QueryRow(ctx,
		`DELETE FROM seller_banners WHERE id = $1 AND store_id = $2 RETURNING `+sellerBannerCols,
		id, storeID)
	b, err := scanSellerBanner(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSellerBannerNotFound
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}
