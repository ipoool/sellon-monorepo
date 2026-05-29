package repository

import (
	"context"
	"crypto/rand"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrTableNotFound = errors.New("table not found")

type RestaurantTable struct {
	ID        uuid.UUID
	StoreID   uuid.UUID
	Label     string
	Area      string
	QRToken   string
	IsActive  bool
	SortOrder int
	CreatedAt time.Time
}

// TableResolution is the public payload for a scanned table QR.
type TableResolution struct {
	StoreSlug   string
	StoreName   string
	TableID     uuid.UUID
	TableLabel  string
	PaymentMode string
	DineInOn    bool
}

type DineInSettings struct {
	Enabled     bool
	PaymentMode string // "cashier" | "online"
	KDSEnabled  bool
}

type TableRepo struct {
	pool *pgxpool.Pool
}

func NewTableRepo(pool *pgxpool.Pool) *TableRepo { return &TableRepo{pool: pool} }

func (r *TableRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]RestaurantTable, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, label, area, qr_token, is_active, sort_order, created_at
		FROM restaurant_tables WHERE store_id = $1 AND is_active = true
		ORDER BY sort_order, label
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RestaurantTable
	for rows.Next() {
		var t RestaurantTable
		if err := rows.Scan(&t.ID, &t.StoreID, &t.Label, &t.Area, &t.QRToken, &t.IsActive, &t.SortOrder, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *TableRepo) Create(ctx context.Context, storeID uuid.UUID, label, area string) (*RestaurantTable, error) {
	var t RestaurantTable
	for attempt := 0; attempt < 6; attempt++ {
		token := generateToken(22)
		err := r.pool.QueryRow(ctx, `
			INSERT INTO restaurant_tables (store_id, label, area, qr_token)
			VALUES ($1, $2, $3, $4)
			RETURNING id, store_id, label, area, qr_token, is_active, sort_order, created_at
		`, storeID, label, area, token).Scan(
			&t.ID, &t.StoreID, &t.Label, &t.Area, &t.QRToken, &t.IsActive, &t.SortOrder, &t.CreatedAt)
		if err == nil {
			return &t, nil
		}
		// Retry only on token collision; surface label-unique + other errors.
		if attempt == 5 {
			return nil, err
		}
	}
	return nil, errors.New("gagal membuat meja")
}

func (r *TableRepo) Update(ctx context.Context, storeID, id uuid.UUID, label, area string) error {
	ct, err := r.pool.Exec(ctx,
		`UPDATE restaurant_tables SET label = $3, area = $4, updated_at = now() WHERE id = $1 AND store_id = $2`,
		id, storeID, label, area)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrTableNotFound
	}
	return nil
}

func (r *TableRepo) SoftDelete(ctx context.Context, storeID, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE restaurant_tables SET is_active = false, updated_at = now() WHERE id = $1 AND store_id = $2`,
		id, storeID)
	return err
}

// ResolveByToken maps a scanned QR token to its store + table (public, no auth).
func (r *TableRepo) ResolveByToken(ctx context.Context, token string) (*TableResolution, error) {
	var res TableResolution
	err := r.pool.QueryRow(ctx, `
		SELECT s.slug, s.name, t.id, t.label, s.dinein_payment_mode, s.dinein_enabled
		FROM restaurant_tables t
		JOIN stores s ON s.id = t.store_id
		WHERE t.qr_token = $1 AND t.is_active = true
	`, token).Scan(&res.StoreSlug, &res.StoreName, &res.TableID, &res.TableLabel, &res.PaymentMode, &res.DineInOn)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTableNotFound
	}
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func (r *TableRepo) GetDineInSettings(ctx context.Context, storeID uuid.UUID) (*DineInSettings, error) {
	var s DineInSettings
	err := r.pool.QueryRow(ctx,
		`SELECT dinein_enabled, dinein_payment_mode, kds_enabled FROM stores WHERE id = $1`, storeID,
	).Scan(&s.Enabled, &s.PaymentMode, &s.KDSEnabled)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *TableRepo) UpdateDineInSettings(ctx context.Context, storeID uuid.UUID, s DineInSettings) error {
	mode := s.PaymentMode
	if mode != "cashier" && mode != "online" {
		mode = "cashier"
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE stores SET dinein_enabled = $2, dinein_payment_mode = $3, kds_enabled = $4, updated_at = now()
		WHERE id = $1
	`, storeID, s.Enabled, mode, s.KDSEnabled)
	return err
}

// generateToken returns an opaque base62 token of n chars (crypto/rand).
func generateToken(n int) string {
	const charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}
