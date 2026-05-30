package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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
	NotificationWhatsAppNumber string
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
	ProductLayout              string // grid|list|showcase
	ShowHoursPublic            bool
	ShowSocialPublic           bool
	FooterText                 string
	SegmentVipThreshold        int // min orders to be VIP (default 10)
	SegmentLoyalThreshold      int // min orders to be Loyal (default 3)
	SegmentBaruName            string
	SegmentRegulerName         string
	SegmentLoyalName           string
	SegmentVipName             string
	CustomDomain               *string    // nullable; set by Bisnis sellers
	DomainStatus               string     // none|pending|active|failed
	DomainVerifiedAt           *time.Time // nullable
	LayoutConfig               []byte     // raw JSONB per-layout config
	CreatedAt                  time.Time
	UpdatedAt                  time.Time
}

type StoreRepo struct {
	pool *pgxpool.Pool
}

func NewStoreRepo(pool *pgxpool.Pool) *StoreRepo {
	return &StoreRepo{pool: pool}
}

var (
	ErrStoreNotFound = errors.New("store not found")
	ErrDomainTaken   = errors.New("custom domain already used by another store")
)

const storeColumns = `id, owner_id, slug, name, description, logo_url, banner_url, tagline,
	category, city, whatsapp_number, notification_whatsapp_number, instagram, tiktok, open_hours, is_open,
	shipping_origin_city, shipping_origin_city_id, shipping_origin_city_name,
	enabled_couriers, free_shipping_threshold_cents,
	theme_hue, product_layout, show_hours_public, show_social_public, footer_text,
	segment_vip_threshold, segment_loyal_threshold,
	segment_baru_name, segment_reguler_name, segment_loyal_name, segment_vip_name,
	custom_domain, domain_status, domain_verified_at,
	layout_config,
	created_at, updated_at`

// Same column list but qualified with the `s.` alias, used in joins.
const qualifiedStoreColumns = `s.id, s.owner_id, s.slug, s.name, s.description,
	s.logo_url, s.banner_url, s.tagline, s.category, s.city,
	s.whatsapp_number, s.notification_whatsapp_number, s.instagram, s.tiktok, s.open_hours, s.is_open,
	s.shipping_origin_city, s.shipping_origin_city_id, s.shipping_origin_city_name,
	s.enabled_couriers, s.free_shipping_threshold_cents,
	s.theme_hue, s.product_layout, s.show_hours_public, s.show_social_public, s.footer_text,
	s.segment_vip_threshold, s.segment_loyal_threshold,
	s.segment_baru_name, s.segment_reguler_name, s.segment_loyal_name, s.segment_vip_name,
	s.custom_domain, s.domain_status, s.domain_verified_at,
	s.layout_config,
	s.created_at, s.updated_at`

func scanStore(row pgx.Row, s *Store) error {
	return row.Scan(
		&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.LogoURL,
		&s.BannerURL, &s.Tagline,
		&s.Category, &s.City, &s.WhatsAppNumber, &s.NotificationWhatsAppNumber,
		&s.Instagram, &s.TikTok,
		&s.OpenHours, &s.IsOpen,
		&s.ShippingOriginCity, &s.ShippingOriginCityID, &s.ShippingOriginCityName,
		&s.EnabledCouriers, &s.FreeShippingThresholdCents,
		&s.ThemeHue, &s.ProductLayout, &s.ShowHoursPublic, &s.ShowSocialPublic, &s.FooterText,
		&s.SegmentVipThreshold, &s.SegmentLoyalThreshold,
		&s.SegmentBaruName, &s.SegmentRegulerName, &s.SegmentLoyalName, &s.SegmentVipName,
		&s.CustomDomain, &s.DomainStatus, &s.DomainVerifiedAt,
		&s.LayoutConfig,
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

// FindByID looks up a store by its UUID. Used by background jobs and
// webhooks where we have the store_id but not the slug.
func (r *StoreRepo) FindByID(ctx context.Context, id uuid.UUID) (*Store, error) {
	q := `SELECT ` + storeColumns + ` FROM stores WHERE id = $1`
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, id), &s); err != nil {
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
	// Wajib dalam satu transaksi: kalau owner-membership gagal di-insert,
	// store yang baru di-create harus ikut rollback. Tanpa membership,
	// FindByOwnerID/Member balik null → user kena loop /setup → /dashboard
	// → /setup karena dashboard layout lihat "store tidak ada".
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var s Store
	if err := scanStore(tx.QueryRow(ctx, `
		INSERT INTO stores (owner_id, slug, name, category, city)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+storeColumns,
		in.OwnerID, in.Slug, in.Name, in.Category, in.City,
	), &s); err != nil {
		return nil, err
	}

	// Insert owner membership. ON CONFLICT DO NOTHING jaga-jaga kalau
	// ada race condition (mis. paralel double-submit) — store_members
	// punya PK (store_id, user_id).
	if _, err := tx.Exec(ctx, `
		INSERT INTO store_members (store_id, user_id, role)
		VALUES ($1, $2, 'owner')
		ON CONFLICT (store_id, user_id) DO NOTHING
	`, s.ID, in.OwnerID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &s, nil
}

type UpdateStoreInput struct {
	Name                       string
	Description                string
	LogoURL                    string
	BannerURL                  string
	Tagline                    string
	Category                   string
	City                       string
	WhatsAppNumber             string
	NotificationWhatsAppNumber string
	Instagram                  string
	TikTok                     string
	OpenHoursJSON              []byte // raw JSON; nil = don't update
	IsOpen                     bool
}

type UpdateStorefrontInput struct {
	LogoURL          string
	BannerURL        string
	Tagline          string
	ThemeHue         int
	ProductLayout    string
	ShowHoursPublic  bool
	ShowSocialPublic bool
	FooterText       string
	LayoutConfigJSON []byte // nil = don't update; non-nil = replace
}

// UpdateStorefront is a narrow updater for the Pengaturan → Storefront page
// (logo + banner + tagline + theme hue + product layout + visibility + footer).
func (r *StoreRepo) UpdateStorefront(ctx context.Context, id uuid.UUID, in UpdateStorefrontInput) (*Store, error) {
	hue := in.ThemeHue
	if hue < 0 || hue > 360 {
		hue = 145
	}
	layout := in.ProductLayout
	switch layout {
	case "grid", "list", "showcase", "compact", "magazine", "feed", "kiosk", "katalog", "poster":
		// ok
	default:
		layout = "grid"
	}
	var layoutConfigArg interface{}
	if len(in.LayoutConfigJSON) > 0 {
		layoutConfigArg = string(in.LayoutConfigJSON)
	}
	q := `
		UPDATE stores
		SET logo_url = $2, banner_url = $3, tagline = $4,
		    theme_hue = $5, product_layout = $6,
		    show_hours_public = $7, show_social_public = $8,
		    footer_text = $9,
		    layout_config = COALESCE($10::jsonb, layout_config),
		    updated_at = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, id,
		in.LogoURL, in.BannerURL, in.Tagline,
		hue, layout, in.ShowHoursPublic, in.ShowSocialPublic,
		in.FooterText, layoutConfigArg,
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

// SetIsOpen flips the is_open flag without touching other fields. Dipakai
// oleh flow yang butuh force-offline toko sementara (mis. rotate webhook
// token Midtrans — seller harus paste URL baru sebelum order baru bisa
// proses pembayaran). Caller separate audit log sendiri.
func (r *StoreRepo) SetIsOpen(ctx context.Context, id uuid.UUID, open bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE stores SET is_open = $2, updated_at = now() WHERE id = $1
	`, id, open)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrStoreNotFound
	}
	return nil
}

// FindByDomain looks up a store by its verified custom domain.
func (r *StoreRepo) FindByDomain(ctx context.Context, domain string) (*Store, error) {
	q := `SELECT ` + storeColumns + ` FROM stores WHERE custom_domain = $1`
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, domain), &s); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStoreNotFound
		}
		return nil, err
	}
	return &s, nil
}

// SetCustomDomain saves a new custom domain and resets verification to pending.
// Returns ErrDomainTaken if another store already owns that domain.
func (r *StoreRepo) SetCustomDomain(ctx context.Context, storeID uuid.UUID, domain string) (*Store, error) {
	q := `
		UPDATE stores
		SET custom_domain     = $2,
		    domain_status     = 'pending',
		    domain_verified_at = NULL,
		    updated_at        = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, storeID, domain), &s); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrDomainTaken
		}
		return nil, err
	}
	return &s, nil
}

// SetDomainStatus updates the verification status. When status is "active",
// domain_verified_at is set to now(); otherwise it is cleared.
func (r *StoreRepo) SetDomainStatus(ctx context.Context, storeID uuid.UUID, status string) (*Store, error) {
	var verifiedAt interface{}
	if status == "active" {
		verifiedAt = time.Now()
	}
	q := `
		UPDATE stores
		SET domain_status     = $2,
		    domain_verified_at = $3,
		    updated_at        = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, storeID, status, verifiedAt), &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// ClearCustomDomain removes the custom domain and resets status to none.
func (r *StoreRepo) ClearCustomDomain(ctx context.Context, storeID uuid.UUID) (*Store, error) {
	q := `
		UPDATE stores
		SET custom_domain     = NULL,
		    domain_status     = 'none',
		    domain_verified_at = NULL,
		    updated_at        = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, storeID), &s); err != nil {
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
		    whatsapp_number = $9,
		    notification_whatsapp_number = $10,
		    instagram = $11, tiktok = $12,
		    open_hours = COALESCE($13::jsonb, open_hours),
		    is_open = $14,
		    updated_at = now()
		WHERE id = $1
		RETURNING ` + storeColumns
	var s Store
	if err := scanStore(r.pool.QueryRow(ctx, q, id,
		in.Name, in.Description, in.LogoURL,
		in.BannerURL, in.Tagline,
		in.Category, in.City,
		in.WhatsAppNumber, in.NotificationWhatsAppNumber,
		in.Instagram, in.TikTok,
		in.OpenHoursJSON, in.IsOpen,
	), &s); err != nil {
		return nil, err
	}
	return &s, nil
}
