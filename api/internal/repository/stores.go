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
	ID                         uuid.UUID
	OwnerID                    uuid.UUID
	Slug                       string
	Name                       string
	Description                string
	LogoURL                    string
	BannerURL                  string
	Tagline                    string
	Category                   string
	City                       string
	WhatsAppNumber             string
	Instagram                  string
	TikTok                     string
	OpenHours                  []byte // raw JSONB
	IsOpen                     bool
	ShippingOriginCity         string
	ShippingOriginCityID       string
	ShippingOriginCityName     string
	EnabledCouriers            []string
	FreeShippingThresholdCents int64
	ThemeHue                   int
	ShowHoursPublic            bool
	ShowSocialPublic           bool
	FooterText                 string
	CreatedAt                  time.Time
	UpdatedAt                  time.Time
}

type StoreRepo struct {
	pool *pgxpool.Pool
}

func NewStoreRepo(pool *pgxpool.Pool) *StoreRepo {
	return &StoreRepo{pool: pool}
}

var ErrStoreNotFound = errors.New("store not found")

const storeColumns = `id, owner_id, slug, name, description, logo_url, banner_url, tagline,
	category, city, whatsapp_number, instagram, tiktok, open_hours, is_open,
	shipping_origin_city, shipping_origin_city_id, shipping_origin_city_name,
	enabled_couriers, free_shipping_threshold_cents,
	theme_hue, show_hours_public, show_social_public, footer_text,
	created_at, updated_at`

// Same column list but qualified with the `s.` alias, used in joins.
const qualifiedStoreColumns = `s.id, s.owner_id, s.slug, s.name, s.description,
	s.logo_url, s.banner_url, s.tagline, s.category, s.city,
	s.whatsapp_number, s.instagram, s.tiktok, s.open_hours, s.is_open,
	s.shipping_origin_city, s.shipping_origin_city_id, s.shipping_origin_city_name,
	s.enabled_couriers, s.free_shipping_threshold_cents,
	s.theme_hue, s.show_hours_public, s.show_social_public, s.footer_text,
	s.created_at, s.updated_at`

func scanStore(row pgx.Row, s *Store) error {
	return row.Scan(
		&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.LogoURL,
		&s.BannerURL, &s.Tagline,
		&s.Category, &s.City, &s.WhatsAppNumber, &s.Instagram, &s.TikTok,
		&s.OpenHours, &s.IsOpen,
		&s.ShippingOriginCity, &s.ShippingOriginCityID, &s.ShippingOriginCityName,
		&s.EnabledCouriers, &s.FreeShippingThresholdCents,
		&s.ThemeHue, &s.ShowHoursPublic, &s.ShowSocialPublic, &s.FooterText,
		&s.CreatedAt, &s.UpdatedAt,
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

// FindByOwnerID is misnamed for legacy reasons — it now returns the store
// the user is a member of (owner OR staff/admin). Original meaning preserved
// for the few "owner-only" actions, but those should call FindByMemberID
// followed by RoleFor() instead.
func (r *StoreRepo) FindByOwnerID(ctx context.Context, userID uuid.UUID) (*Store, error) {
	return r.FindByMemberID(ctx, userID)
}

// FindByMemberID returns the store the user has any membership in. If
// they're a member of multiple stores (rare), the most recent one wins.
func (r *StoreRepo) FindByMemberID(ctx context.Context, userID uuid.UUID) (*Store, error) {
	q := `SELECT ` + qualifiedStoreColumns + `
	      FROM stores s
	      JOIN store_members m ON m.store_id = s.id
	      WHERE m.user_id = $1
	      ORDER BY (m.role = 'owner') DESC, m.created_at ASC
	      LIMIT 1`
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, userID), &s); err != nil {
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
	BannerURL      string
	Tagline        string
	Category       string
	City           string
	WhatsAppNumber string
	Instagram      string
	TikTok         string
	OpenHoursJSON  []byte // raw JSON; nil = don't update
	IsOpen         bool
}

type UpdateStorefrontInput struct {
	LogoURL          string
	BannerURL        string
	Tagline          string
	ThemeHue         int
	ShowHoursPublic  bool
	ShowSocialPublic bool
	FooterText       string
}

// UpdateStorefront is a narrow updater for the Pengaturan → Storefront page
// (logo + banner + tagline + theme hue + visibility toggles + footer).
func (r *StoreRepo) UpdateStorefront(ctx context.Context, id uuid.UUID, in UpdateStorefrontInput) (*Store, error) {
	hue := in.ThemeHue
	if hue < 0 || hue > 360 {
		hue = 145
	}
	q := `
		UPDATE stores
		SET logo_url = $2, banner_url = $3, tagline = $4,
		    theme_hue = $5, show_hours_public = $6, show_social_public = $7,
		    footer_text = $8,
		    updated_at = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, id,
		in.LogoURL, in.BannerURL, in.Tagline,
		hue, in.ShowHoursPublic, in.ShowSocialPublic,
		in.FooterText,
	), &s); err != nil {
		return nil, err
	}
	return &s, nil
}

type UpdateShippingInput struct {
	ShippingOriginCity         string
	ShippingOriginCityID       string
	ShippingOriginCityName     string
	EnabledCouriers            []string
	FreeShippingThresholdCents int64
}

// UpdateShipping is a narrow updater for the Pengiriman settings page —
// callers shouldn't need to round-trip every store field just to flip a
// courier toggle.
func (r *StoreRepo) UpdateShipping(ctx context.Context, id uuid.UUID, in UpdateShippingInput) (*Store, error) {
	q := `
		UPDATE stores
		SET shipping_origin_city = $2,
		    shipping_origin_city_id = $3,
		    shipping_origin_city_name = $4,
		    enabled_couriers = $5,
		    free_shipping_threshold_cents = $6,
		    updated_at = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, id,
		in.ShippingOriginCity, in.ShippingOriginCityID, in.ShippingOriginCityName,
		in.EnabledCouriers, in.FreeShippingThresholdCents,
	), &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *StoreRepo) Update(ctx context.Context, id uuid.UUID, in UpdateStoreInput) (*Store, error) {
	q := `
		UPDATE stores
		SET name = $2, description = $3, logo_url = $4,
		    banner_url = $5, tagline = $6,
		    category = $7, city = $8,
		    whatsapp_number = $9, instagram = $10, tiktok = $11,
		    open_hours = COALESCE($12::jsonb, open_hours),
		    is_open = $13,
		    updated_at = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, id,
		in.Name, in.Description, in.LogoURL,
		in.BannerURL, in.Tagline,
		in.Category, in.City,
		in.WhatsAppNumber, in.Instagram, in.TikTok,
		in.OpenHoursJSON, in.IsOpen,
	), &s); err != nil {
		return nil, err
	}
	return &s, nil
}
