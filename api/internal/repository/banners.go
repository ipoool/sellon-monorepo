package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrBannerNotFound = errors.New("banner not found")

// Banner is a platform-managed promo/info image shown on the seller dashboard.
type Banner struct {
	ID        uuid.UUID
	ImageURL  string
	ImagePath string
	Title     string
	LinkURL   string
	IsActive  bool
	SortOrder int
	CreatedAt time.Time
	UpdatedAt time.Time
}

type BannerRepo struct {
	pool *pgxpool.Pool
}

func NewBannerRepo(pool *pgxpool.Pool) *BannerRepo { return &BannerRepo{pool: pool} }

const bannerCols = `id, image_url, image_path, title, link_url, is_active, sort_order, created_at, updated_at`

func scanBanner(row pgx.Row) (*Banner, error) {
	var b Banner
	if err := row.Scan(
		&b.ID, &b.ImageURL, &b.ImagePath, &b.Title, &b.LinkURL,
		&b.IsActive, &b.SortOrder, &b.CreatedAt, &b.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *BannerRepo) queryList(ctx context.Context, sql string) ([]Banner, error) {
	rows, err := r.pool.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Banner{}
	for rows.Next() {
		b, err := scanBanner(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

// ListAll returns every banner (admin view), newest-first within sort order.
func (r *BannerRepo) ListAll(ctx context.Context) ([]Banner, error) {
	return r.queryList(ctx, `SELECT `+bannerCols+`
		FROM platform_banners
		ORDER BY sort_order ASC, created_at DESC`)
}

// ListActive returns only active banners, for the seller dashboard slider.
func (r *BannerRepo) ListActive(ctx context.Context) ([]Banner, error) {
	return r.queryList(ctx, `SELECT `+bannerCols+`
		FROM platform_banners
		WHERE is_active = true
		ORDER BY sort_order ASC, created_at DESC`)
}

type BannerInput struct {
	ImageURL  string
	ImagePath string
	Title     string
	LinkURL   string
	SortOrder int
}

func (r *BannerRepo) Create(ctx context.Context, in BannerInput) (*Banner, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO platform_banners (image_url, image_path, title, link_url, sort_order)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+bannerCols,
		in.ImageURL, in.ImagePath, in.Title, in.LinkURL, in.SortOrder)
	return scanBanner(row)
}

type BannerUpdate struct {
	Title     string
	LinkURL   string
	IsActive  bool
	SortOrder int
}

func (r *BannerRepo) Update(ctx context.Context, id uuid.UUID, in BannerUpdate) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE platform_banners
		SET title = $2, link_url = $3, is_active = $4, sort_order = $5, updated_at = now()
		WHERE id = $1`,
		id, in.Title, in.LinkURL, in.IsActive, in.SortOrder)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrBannerNotFound
	}
	return nil
}

// Delete removes a banner and returns the deleted row so the caller can clean
// up its storage object.
func (r *BannerRepo) Delete(ctx context.Context, id uuid.UUID) (*Banner, error) {
	row := r.pool.QueryRow(ctx, `DELETE FROM platform_banners WHERE id = $1 RETURNING `+bannerCols, id)
	b, err := scanBanner(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBannerNotFound
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}
