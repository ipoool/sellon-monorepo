package repository

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrDownloadTokenNotFound = errors.New("download token not found")

type DownloadToken struct {
	ID             uuid.UUID
	Token          string
	OrderID        uuid.UUID
	OrderItemID    uuid.UUID
	StoreID        uuid.UUID
	ExpiresAt      *time.Time
	ConsumedCount  int
	LastConsumedAt *time.Time
	CreatedAt      time.Time
}

// DownloadInfo carries everything the public /download/{token} page
// needs in one round-trip — no extra repo joins required by the
// handler. Sensitive seller fields (delivery URL, file URL,
// instructions) come from products via order_items.product_id, but
// product can be deleted so we still want to gracefully fall back to
// the product_name copied at order time.
type DownloadInfo struct {
	Token               DownloadToken
	StoreName           string
	StoreSlug           string
	OrderNumber         string
	CustomerName        string
	ProductName         string
	VariantName         string
	DigitalDeliveryURL  string
	DigitalFileURL      string
	DigitalInstructions string
}

type DownloadTokenRepo struct {
	pool *pgxpool.Pool
}

func NewDownloadTokenRepo(pool *pgxpool.Pool) *DownloadTokenRepo {
	return &DownloadTokenRepo{pool: pool}
}

// Create inserts one token. Caller is responsible for selecting the
// digital order_items + generating tokens; this just persists.
func (r *DownloadTokenRepo) Create(ctx context.Context, in DownloadToken) (*DownloadToken, error) {
	if in.Token == "" {
		t, err := newSecureToken()
		if err != nil {
			return nil, err
		}
		in.Token = t
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO download_tokens (token, order_id, order_item_id, store_id, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, token, order_id, order_item_id, store_id, expires_at,
		          consumed_count, last_consumed_at, created_at
	`, in.Token, in.OrderID, in.OrderItemID, in.StoreID, in.ExpiresAt)
	var t DownloadToken
	if err := row.Scan(
		&t.ID, &t.Token, &t.OrderID, &t.OrderItemID, &t.StoreID,
		&t.ExpiresAt, &t.ConsumedCount, &t.LastConsumedAt, &t.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &t, nil
}

// FindForDelivery looks up everything the download page needs in one
// query. Returns ErrDownloadTokenNotFound on miss — caller should
// surface a generic "link tidak valid" message rather than 404 (which
// would leak token enumeration).
func (r *DownloadTokenRepo) FindForDelivery(ctx context.Context, token string) (*DownloadInfo, error) {
	const q = `
		SELECT
		  dt.id, dt.token, dt.order_id, dt.order_item_id, dt.store_id,
		  dt.expires_at, dt.consumed_count, dt.last_consumed_at, dt.created_at,
		  s.name, s.slug,
		  o.order_number, o.customer_name,
		  oi.product_name, oi.variant_name,
		  COALESCE(p.digital_delivery_url, ''),
		  COALESCE(p.digital_file_url, ''),
		  COALESCE(p.digital_instructions, '')
		FROM download_tokens dt
		JOIN stores s        ON s.id  = dt.store_id
		JOIN orders o        ON o.id  = dt.order_id
		JOIN order_items oi  ON oi.id = dt.order_item_id
		LEFT JOIN products p ON p.id  = oi.product_id
		WHERE dt.token = $1
		LIMIT 1
	`
	var info DownloadInfo
	err := r.pool.QueryRow(ctx, q, token).Scan(
		&info.Token.ID, &info.Token.Token, &info.Token.OrderID, &info.Token.OrderItemID, &info.Token.StoreID,
		&info.Token.ExpiresAt, &info.Token.ConsumedCount, &info.Token.LastConsumedAt, &info.Token.CreatedAt,
		&info.StoreName, &info.StoreSlug,
		&info.OrderNumber, &info.CustomerName,
		&info.ProductName, &info.VariantName,
		&info.DigitalDeliveryURL, &info.DigitalFileURL, &info.DigitalInstructions,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDownloadTokenNotFound
	}
	if err != nil {
		return nil, err
	}
	return &info, nil
}

// MarkConsumed bumps the consumed_count + last_consumed_at. Best-
// effort: failures don't block the user from accessing the file.
func (r *DownloadTokenRepo) MarkConsumed(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE download_tokens
		SET consumed_count = consumed_count + 1,
		    last_consumed_at = now()
		WHERE token = $1
	`, token)
	return err
}

// ListForOrder returns every token issued for an order. Used by the
// seller's order detail page so they can see which items shipped and
// re-send the link if needed.
func (r *DownloadTokenRepo) ListForOrder(ctx context.Context, orderID uuid.UUID) ([]DownloadToken, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, token, order_id, order_item_id, store_id, expires_at,
		       consumed_count, last_consumed_at, created_at
		FROM download_tokens
		WHERE order_id = $1
		ORDER BY created_at ASC
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DownloadToken
	for rows.Next() {
		var t DownloadToken
		if err := rows.Scan(
			&t.ID, &t.Token, &t.OrderID, &t.OrderItemID, &t.StoreID,
			&t.ExpiresAt, &t.ConsumedCount, &t.LastConsumedAt, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// newSecureToken returns a 32-byte URL-safe random string. ~43 chars,
// roughly UUIDv4-equivalent entropy. Sufficient against guessing — a
// brute-forcer would need ~2^256 tries.
func newSecureToken() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}
