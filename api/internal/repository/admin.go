package repository

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminRepo houses cross-tenant aggregates used only by /api/v1/admin
// endpoints. Kept separate from per-store repos so it's obvious at the
// import site when a query is unscoped by store_id.
type AdminRepo struct {
	pool *pgxpool.Pool
}

func NewAdminRepo(pool *pgxpool.Pool) *AdminRepo {
	return &AdminRepo{pool: pool}
}

type AdminStats struct {
	TotalUsers       int
	BannedUsers      int
	TotalStores      int
	OpenStores       int
	TotalProducts    int
	TotalOrders      int
	OrdersThisMonth  int
	RevenueAllCents  int64
	RevenueMonthCents int64
	PaidSubsCount    int
}

// Stats runs the dashboard aggregates in parallel-friendly order. Money
// figures count orders whose payment_status = 'paid' AND status <> 'cancelled'
// — paid-then-cancelled rows are assumed refunded out of band (BUG-012).
func (r *AdminRepo) Stats(ctx context.Context) (*AdminStats, error) {
	out := &AdminStats{}

	if err := r.pool.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM users),
		  (SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL),
		  (SELECT COUNT(*) FROM stores),
		  (SELECT COUNT(*) FROM stores WHERE is_open),
		  (SELECT COUNT(*) FROM products),
		  (SELECT COUNT(*) FROM orders),
		  (SELECT COUNT(*) FROM orders
		     WHERE created_at >= date_trunc('month', now())),
		  (SELECT COALESCE(SUM(total_cents), 0) FROM orders
		     WHERE payment_status = 'paid' AND status <> 'cancelled'),
		  (SELECT COALESCE(SUM(total_cents), 0) FROM orders
		     WHERE payment_status = 'paid'
		       AND status <> 'cancelled'
		       AND created_at >= date_trunc('month', now())),
		  (SELECT COUNT(*) FROM subscriptions
		     WHERE plan IN ('pro','bisnis') AND status = 'active')
	`).Scan(
		&out.TotalUsers, &out.BannedUsers,
		&out.TotalStores, &out.OpenStores,
		&out.TotalProducts,
		&out.TotalOrders, &out.OrdersThisMonth,
		&out.RevenueAllCents, &out.RevenueMonthCents,
		&out.PaidSubsCount,
	); err != nil {
		return nil, err
	}
	return out, nil
}

// AdminUserRow is a denormalized user projection for the admin users list.
// It includes the store's current subscription so admin can see plan/expiry
// without a second round-trip per user.
type AdminUserRow struct {
	ID         uuid.UUID
	Email      string
	Name       string
	PictureURL string
	Role       string
	BannedAt   *time.Time
	CreatedAt  time.Time
	// Store subscription — zero-values when user has no store.
	StoreID   *uuid.UUID
	Plan      string // "free" if no store
	SubStatus string // "active" if no store
	PeriodEnd *time.Time
}

// ListUsers powers the admin /users list. Filters out admin-role users so
// they don't show up in the list. q is free-text matched against email/name.
// before is a created_at cursor for pagination.
func (r *AdminRepo) ListUsers(ctx context.Context, q string, limit int, before *time.Time) ([]AdminUserRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{}
	clauses := []string{"u.role <> 'admin'"}
	if s := strings.TrimSpace(q); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		p := itoa(len(args))
		clauses = append(clauses, "(LOWER(u.email) LIKE $"+p+" OR LOWER(u.name) LIKE $"+p+")")
	}
	if before != nil {
		args = append(args, *before)
		clauses = append(clauses, "u.created_at < $"+itoa(len(args)))
	}
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, `
		SELECT
		  u.id, u.email, u.name, u.picture_url, u.role, u.banned_at, u.created_at,
		  s.id,
		  COALESCE(sub.plan, 'free'),
		  COALESCE(sub.status, 'active'),
		  sub.current_period_end
		FROM users u
		LEFT JOIN stores s ON s.owner_id = u.id
		LEFT JOIN subscriptions sub ON sub.store_id = s.id
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY u.created_at DESC
		LIMIT $`+itoa(len(args)), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AdminUserRow
	for rows.Next() {
		var row AdminUserRow
		if err := rows.Scan(
			&row.ID, &row.Email, &row.Name, &row.PictureURL,
			&row.Role, &row.BannedAt, &row.CreatedAt,
			&row.StoreID, &row.Plan, &row.SubStatus, &row.PeriodEnd,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

type StoreSummary struct {
	ID              uuid.UUID
	Slug            string
	Name            string
	OwnerUserID     uuid.UUID
	OwnerEmail      string
	OwnerName       string
	IsOpen          bool
	Plan            string
	SubStatus       string
	PeriodEnd       *time.Time
	ProductsCount   int
	OrdersCount     int
	RevenueCents    int64
	CreatedAt       time.Time
}

// ListStoresWithStats powers /admin/stores. q is a substring matched
// against store name/slug or the owner's email/name.
func (r *AdminRepo) ListStoresWithStats(ctx context.Context, q string, limit int) ([]StoreSummary, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{limit}
	where := ""
	if s := strings.TrimSpace(q); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		where = `WHERE LOWER(s.name) LIKE $2
		         OR LOWER(s.slug) LIKE $2
		         OR LOWER(u.email) LIKE $2
		         OR LOWER(u.name) LIKE $2`
	}
	rows, err := r.pool.Query(ctx, `
		SELECT
		  s.id, s.slug, s.name, s.owner_id,
		  u.email, u.name,
		  s.is_open,
		  COALESCE(sub.plan, 'free'),
		  COALESCE(sub.status, 'active'),
		  sub.current_period_end,
		  (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id),
		  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id),
		  (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o
		     WHERE o.store_id = s.id AND o.payment_status = 'paid' AND o.status <> 'cancelled'),
		  s.created_at
		FROM stores s
		JOIN users u ON u.id = s.owner_id
		LEFT JOIN subscriptions sub ON sub.store_id = s.id
		`+where+`
		ORDER BY s.created_at DESC
		LIMIT $1
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []StoreSummary
	for rows.Next() {
		var s StoreSummary
		if err := rows.Scan(
			&s.ID, &s.Slug, &s.Name, &s.OwnerUserID,
			&s.OwnerEmail, &s.OwnerName,
			&s.IsOpen, &s.Plan, &s.SubStatus, &s.PeriodEnd,
			&s.ProductsCount, &s.OrdersCount, &s.RevenueCents,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// StoresOwnedBy lists every store this user owns. Used on the user
// detail page so the admin can click through to each store.
func (r *AdminRepo) StoresOwnedBy(ctx context.Context, userID uuid.UUID) ([]StoreSummary, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
		  s.id, s.slug, s.name, s.owner_id,
		  u.email, u.name,
		  s.is_open,
		  COALESCE(sub.plan, 'free'),
		  COALESCE(sub.status, 'active'),
		  sub.current_period_end,
		  (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id),
		  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id),
		  (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o
		     WHERE o.store_id = s.id AND o.payment_status = 'paid' AND o.status <> 'cancelled'),
		  s.created_at
		FROM stores s
		JOIN users u ON u.id = s.owner_id
		LEFT JOIN subscriptions sub ON sub.store_id = s.id
		WHERE s.owner_id = $1
		ORDER BY s.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []StoreSummary
	for rows.Next() {
		var s StoreSummary
		if err := rows.Scan(
			&s.ID, &s.Slug, &s.Name, &s.OwnerUserID,
			&s.OwnerEmail, &s.OwnerName,
			&s.IsOpen, &s.Plan, &s.SubStatus, &s.PeriodEnd,
			&s.ProductsCount, &s.OrdersCount, &s.RevenueCents,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
