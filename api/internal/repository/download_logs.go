package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DownloadLog is one access of a download link (one row per link-open).
type DownloadLog struct {
	ID           uuid.UUID
	TokenID      uuid.UUID
	StoreID      uuid.UUID
	OrderID      uuid.UUID
	OrderItemID  uuid.UUID
	CustomerID   *uuid.UUID
	IPAddress    string
	UserAgent    string
	Blocked      bool // hit on a revoked/expired link
	DownloadedAt time.Time
}

// DownloadLink is the per-token audit summary surfaced to the seller: one row
// per digital download link, with usage aggregates + a share signal
// (distinct_ips > 1 suggests the link was shared).
type DownloadLink struct {
	TokenID        uuid.UUID
	OrderID        uuid.UUID
	OrderNumber    string
	ProductName    string
	VariantName    string
	ProductType    string // "digital" | "course" — drives the UI badge
	CustomerID     *uuid.UUID
	CustomerName   string
	DownloadCount  int        // distinct access events logged
	DistinctIPs    int        // distinct IPs seen — >1 = possible sharing
	LastDownloadAt *time.Time
	RevokedAt      *time.Time
	CreatedAt      time.Time
}

// DownloadAccess is a single access row for a link's history view.
type DownloadAccess struct {
	IPAddress    string
	UserAgent    string
	Blocked      bool
	DownloadedAt time.Time
}

type DownloadLogRepo struct {
	pool *pgxpool.Pool
}

func NewDownloadLogRepo(pool *pgxpool.Pool) *DownloadLogRepo {
	return &DownloadLogRepo{pool: pool}
}

// Create records one download access. Best-effort from the caller's side.
func (r *DownloadLogRepo) Create(ctx context.Context, in DownloadLog) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO download_logs (token_id, store_id, order_id, order_item_id, customer_id, ip_address, user_agent, blocked)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, in.TokenID, in.StoreID, in.OrderID, in.OrderItemID, in.CustomerID, in.IPAddress, in.UserAgent, in.Blocked)
	return err
}

// linkSelect builds the per-link aggregate. The download_logs LEFT JOIN
// aggregate gives real distinct-IP + access counts; consumed_count on the
// token is a fallback total but distinct IPs is the share signal.
const linkSelect = `
	SELECT dt.id, dt.order_id, o.order_number,
	       oi.product_name, oi.variant_name, oi.product_type,
	       o.customer_id, o.customer_name,
	       COALESCE(agg.cnt, 0)   AS download_count,
	       COALESCE(agg.ips, 0)   AS distinct_ips,
	       agg.last_at,
	       dt.revoked_at, dt.created_at
	FROM download_tokens dt
	JOIN orders o       ON o.id  = dt.order_id
	JOIN order_items oi ON oi.id = dt.order_item_id
	LEFT JOIN (
		SELECT token_id,
		       COUNT(*) AS cnt,
		       COUNT(DISTINCT NULLIF(ip_address, '')) AS ips,
		       MAX(downloaded_at) AS last_at
		FROM download_logs
		WHERE blocked = false
		GROUP BY token_id
	) agg ON agg.token_id = dt.id
`

func scanLink(rows interface {
	Scan(dest ...any) error
}) (DownloadLink, error) {
	var l DownloadLink
	err := rows.Scan(
		&l.TokenID, &l.OrderID, &l.OrderNumber,
		&l.ProductName, &l.VariantName, &l.ProductType,
		&l.CustomerID, &l.CustomerName,
		&l.DownloadCount, &l.DistinctIPs, &l.LastDownloadAt,
		&l.RevokedAt, &l.CreatedAt,
	)
	return l, err
}

// ListLinksByStore returns digital download links for a store (newest first),
// optionally filtered by a query matching product / order number / customer.
func (r *DownloadLogRepo) ListLinksByStore(ctx context.Context, storeID uuid.UUID, q string, limit, offset int) ([]DownloadLink, int, error) {
	where := "WHERE dt.store_id = $1"
	args := []any{storeID}
	if q != "" {
		where += ` AND (oi.product_name ILIKE $2 OR o.order_number ILIKE $2 OR o.customer_name ILIKE $2)`
		args = append(args, "%"+q+"%")
	}

	var total int
	countSQL := `SELECT COUNT(*) FROM download_tokens dt
		JOIN orders o ON o.id = dt.order_id
		JOIN order_items oi ON oi.id = dt.order_item_id ` + where
	if err := r.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	args = append(args, limit, offset)
	sql := linkSelect + where +
		fmt.Sprintf(` ORDER BY agg.last_at DESC NULLS LAST, dt.created_at DESC LIMIT $%d OFFSET $%d`, limitPos, offsetPos)
	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []DownloadLink{}
	for rows.Next() {
		l, err := scanLink(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, l)
	}
	return out, total, rows.Err()
}

// ListLinksByCustomer returns the download links tied to one customer (for the
// customer-detail "Riwayat Unduhan" card).
func (r *DownloadLogRepo) ListLinksByCustomer(ctx context.Context, storeID, customerID uuid.UUID) ([]DownloadLink, error) {
	sql := linkSelect + ` WHERE dt.store_id = $1 AND o.customer_id = $2
		ORDER BY agg.last_at DESC NULLS LAST, dt.created_at DESC LIMIT 50`
	rows, err := r.pool.Query(ctx, sql, storeID, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DownloadLink{}
	for rows.Next() {
		l, err := scanLink(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// ListAccessByToken returns the access history for one link (store-scoped via
// the token's store_id), newest first.
func (r *DownloadLogRepo) ListAccessByToken(ctx context.Context, storeID, tokenID uuid.UUID) ([]DownloadAccess, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ip_address, user_agent, blocked, downloaded_at
		FROM download_logs
		WHERE store_id = $1 AND token_id = $2
		ORDER BY downloaded_at DESC
		LIMIT 200
	`, storeID, tokenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DownloadAccess{}
	for rows.Next() {
		var a DownloadAccess
		if err := rows.Scan(&a.IPAddress, &a.UserAgent, &a.Blocked, &a.DownloadedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
