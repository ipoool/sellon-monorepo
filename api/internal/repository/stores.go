package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	ID             uuid.UUID
	OwnerID        uuid.UUID
	Slug           string
	Name           string
	Description    string
	LogoURL        string
	Category       string
	City           string
	WhatsAppNumber string
	Instagram      string
	TikTok         string
	OpenHours      []byte // raw JSONB
	IsOpen         bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type StoreRepo struct {
	pool *pgxpool.Pool
}

func NewStoreRepo(pool *pgxpool.Pool) *StoreRepo {
	return &StoreRepo{pool: pool}
}

var ErrStoreNotFound = errors.New("store not found")

const storeColumns = `id, owner_id, slug, name, description, logo_url, category, city,
	whatsapp_number, instagram, tiktok, open_hours, is_open, created_at, updated_at`

func scanStore(row pgx.Row, s *Store) error {
	return row.Scan(
		&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.LogoURL,
		&s.Category, &s.City, &s.WhatsAppNumber, &s.Instagram, &s.TikTok,
		&s.OpenHours, &s.IsOpen, &s.CreatedAt, &s.UpdatedAt,
	)
}

func (r *StoreRepo) FindBySlug(ctx context.Context, slug string) (*Store, error) {
	q := `SELECT ` + storeColumns + ` FROM stores WHERE slug = $1`
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, slug), &s); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStoreNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *StoreRepo) FindByOwnerID(ctx context.Context, ownerID uuid.UUID) (*Store, error) {
	q := `SELECT ` + storeColumns + ` FROM stores WHERE owner_id = $1`
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, ownerID), &s); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStoreNotFound
		}
		return nil, err
	}
	return &s, nil
}

type CreateStoreInput struct {
	OwnerID  uuid.UUID
	Slug     string
	Name     string
	Category string
	City     string
}

func (r *StoreRepo) Create(ctx context.Context, in CreateStoreInput) (*Store, error) {
	q := `
		INSERT INTO stores (owner_id, slug, name, category, city)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, in.OwnerID, in.Slug, in.Name, in.Category, in.City), &s); err != nil {
		return nil, err
	}
	return &s, nil
}

type UpdateStoreInput struct {
	Name           string
	Description    string
	LogoURL        string
	Category       string
	City           string
	WhatsAppNumber string
	Instagram      string
	TikTok         string
	OpenHoursJSON  []byte // raw JSON; nil = don't update
	IsOpen         bool
}

func (r *StoreRepo) Update(ctx context.Context, id uuid.UUID, in UpdateStoreInput) (*Store, error) {
	q := `
		UPDATE stores
		SET name = $2, description = $3, logo_url = $4, category = $5, city = $6,
		    whatsapp_number = $7, instagram = $8, tiktok = $9,
		    open_hours = COALESCE($10::jsonb, open_hours),
		    is_open = $11,
		    updated_at = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, id,
		in.Name, in.Description, in.LogoURL, in.Category, in.City,
		in.WhatsAppNumber, in.Instagram, in.TikTok,
		in.OpenHoursJSON, in.IsOpen,
	), &s); err != nil {
		return nil, err
	}
	return &s, nil
}
