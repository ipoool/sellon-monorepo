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

func (r *StoreRepo) FindBySlug(ctx context.Context, slug string) (*Store, error) {
	const q = `
		SELECT id, owner_id, slug, name, description, logo_url, category, city,
		       whatsapp_number, instagram, tiktok, is_open, created_at, updated_at
		FROM stores WHERE slug = $1
	`
	var s Store
	err := r.pool.QueryRow(ctx, q, slug).Scan(
		&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.LogoURL,
		&s.Category, &s.City, &s.WhatsAppNumber, &s.Instagram, &s.TikTok,
		&s.IsOpen, &s.CreatedAt, &s.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrStoreNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *StoreRepo) FindByOwnerID(ctx context.Context, ownerID uuid.UUID) (*Store, error) {
	const q = `
		SELECT id, owner_id, slug, name, description, logo_url, category, city,
		       whatsapp_number, instagram, tiktok, is_open, created_at, updated_at
		FROM stores WHERE owner_id = $1
	`
	var s Store
	err := r.pool.QueryRow(ctx, q, ownerID).Scan(
		&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.LogoURL,
		&s.Category, &s.City, &s.WhatsAppNumber, &s.Instagram, &s.TikTok,
		&s.IsOpen, &s.CreatedAt, &s.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrStoreNotFound
	}
	if err != nil {
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
	const q = `
		INSERT INTO stores (owner_id, slug, name, category, city)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, owner_id, slug, name, description, logo_url, category, city,
		          whatsapp_number, instagram, tiktok, is_open, created_at, updated_at
	`
	var s Store
	err := r.pool.QueryRow(ctx, q, in.OwnerID, in.Slug, in.Name, in.Category, in.City).Scan(
		&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.LogoURL,
		&s.Category, &s.City, &s.WhatsAppNumber, &s.Instagram, &s.TikTok,
		&s.IsOpen, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
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
	IsOpen         bool
}

func (r *StoreRepo) Update(ctx context.Context, id uuid.UUID, in UpdateStoreInput) (*Store, error) {
	const q = `
		UPDATE stores
		SET name = $2, description = $3, logo_url = $4, category = $5, city = $6,
		    whatsapp_number = $7, instagram = $8, tiktok = $9, is_open = $10,
		    updated_at = now()
		WHERE id = $1
		RETURNING id, owner_id, slug, name, description, logo_url, category, city,
		          whatsapp_number, instagram, tiktok, is_open, created_at, updated_at
	`
	var s Store
	err := r.pool.QueryRow(ctx, q, id,
		in.Name, in.Description, in.LogoURL, in.Category, in.City,
		in.WhatsAppNumber, in.Instagram, in.TikTok, in.IsOpen,
	).Scan(
		&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.LogoURL,
		&s.Category, &s.City, &s.WhatsAppNumber, &s.Instagram, &s.TikTok,
		&s.IsOpen, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
