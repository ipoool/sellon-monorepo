package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUserNotFound = errors.New("user not found")

type User struct {
	ID         uuid.UUID
	GoogleID   string
	Email      string
	Name       string
	PictureURL string
	Role       string
	BannedAt   *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (u *User) IsAdmin() bool { return u != nil && u.Role == "admin" }
func (u *User) IsBanned() bool {
	return u != nil && u.BannedAt != nil
}

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

const userCols = `id, google_id, email, name, picture_url, role, banned_at, created_at, updated_at`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.PictureURL,
		&u.Role, &u.BannedAt, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// FindOrCreateByGoogleID upserts on google_id. Returns the user row whether
// it was newly inserted or already existed. Second return value `isNew` is
// true kalau baris baru saja di-insert (untuk trigger welcome email). Pakai
// Postgres trick `xmax = 0` — saat INSERT, xmax masih 0; saat UPDATE,
// xmax non-zero. Email/name/picture are refreshed every login so profile
// changes propagate. Role + banned_at are preserved.
func (r *UserRepo) FindOrCreateByGoogleID(ctx context.Context, googleID, email, name, pictureURL string) (*User, bool, error) {
	const q = `
		INSERT INTO users (google_id, email, name, picture_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (google_id) DO UPDATE
		SET email = EXCLUDED.email,
		    name = EXCLUDED.name,
		    picture_url = EXCLUDED.picture_url,
		    updated_at = now()
		RETURNING ` + userCols + `, (xmax = 0) AS is_new`
	row := r.pool.QueryRow(ctx, q, googleID, email, name, pictureURL)
	var u User
	var isNew bool
	if err := row.Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.PictureURL,
		&u.Role, &u.BannedAt, &u.CreatedAt, &u.UpdatedAt,
		&isNew,
	); err != nil {
		return nil, false, err
	}
	return &u, isNew, nil
}

func (r *UserRepo) FindByID(ctx context.Context, id uuid.UUID) (*User, error) {
	const q = `SELECT ` + userCols + ` FROM users WHERE id = $1`
	u, err := scanUser(r.pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	return u, err
}

// FindByEmail looks up a user by lowercased email — used by the staff
// invite flow to detect when an invitee already has an account.
func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	const q = `SELECT ` + userCols + ` FROM users WHERE LOWER(email) = $1 LIMIT 1`
	u, err := scanUser(r.pool.QueryRow(ctx, q, email))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	return u, err
}

// CollectStorageURLs returns all Supabase public URLs referenced by the
// stores yang dimiliki `userID`: logo, banner, product photos, QRIS
// statis di bank_accounts, dan payment proof bukti transfer. Caller
// passing daftar ini ke storage.DeleteObjects setelah DB cascade
// delete supaya tidak ada file orphan. Run sebelum HardDelete karena
// setelah delete, semua row sudah lenyap.
func (r *UserRepo) CollectStorageURLs(ctx context.Context, userID uuid.UUID) ([]string, error) {
	const q = `
		WITH owner_stores AS (
			SELECT id FROM stores WHERE owner_id = $1
		)
		SELECT logo_url FROM stores WHERE id IN (SELECT id FROM owner_stores)
		UNION ALL
		SELECT banner_url FROM stores WHERE id IN (SELECT id FROM owner_stores)
		UNION ALL
		SELECT unnest(photo_urls) FROM products WHERE store_id IN (SELECT id FROM owner_stores)
		UNION ALL
		SELECT qris_url FROM bank_accounts WHERE store_id IN (SELECT id FROM owner_stores)
		UNION ALL
		SELECT payment_proof_url FROM orders WHERE store_id IN (SELECT id FROM owner_stores)
	`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		if strings.TrimSpace(u) != "" {
			out = append(out, u)
		}
	}
	return out, rows.Err()
}

// ListForMarketing returns all non-banned users with a non-empty email address.
// Used by the weekly tips scheduler. Ordered by created_at so new users
// always appear at the end of any batched send.
func (r *UserRepo) ListForMarketing(ctx context.Context) ([]*User, error) {
	const q = `
		SELECT ` + userCols + `
		FROM users
		WHERE banned_at IS NULL AND email <> ''
		ORDER BY created_at`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// HardDelete permanently removes a user row. ON DELETE CASCADE pada
// stores.owner_id + cascade berikutnya (products, orders, dst.) bersihkan
// semua data terkait di satu transaksi. Gambar di Supabase Storage TIDAK
// ikut terhapus — caller harus collect URL-nya dulu lewat helper terpisah
// sebelum panggil ini.
func (r *UserRepo) HardDelete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// SetBanned flips banned_at to now() (or NULL when banned=false). Used
// only by the platform admin role.
func (r *UserRepo) SetBanned(ctx context.Context, id uuid.UUID, banned bool) (*User, error) {
	const q = `
		UPDATE users SET banned_at = CASE WHEN $2 THEN now() ELSE NULL END,
		                 updated_at = now()
		WHERE id = $1
		RETURNING ` + userCols
	return scanUser(r.pool.QueryRow(ctx, q, id, banned))
}

// CountAll returns the total number of registered users — for the
// /admin/stats overview tile.
func (r *UserRepo) CountAll(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// SearchAll powers /admin/users. q is a free-text fragment matched
// against email/name (case-insensitive); pass empty string for no
// filter. Pagination uses (created_at DESC, id DESC) cursor for stable
// ordering.
func (r *UserRepo) SearchAll(ctx context.Context, q string, limit int, before *time.Time) ([]User, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{}
	clauses := []string{"role <> 'admin'"}
	if s := strings.TrimSpace(q); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		clauses = append(clauses, "(LOWER(email) LIKE $1 OR LOWER(name) LIKE $1)")
	}
	if before != nil {
		args = append(args, *before)
		clauses = append(clauses, "created_at < $"+itoaParam(len(args)))
	}
	where := " WHERE " + strings.Join(clauses, " AND ")
	args = append(args, limit)
	query := `SELECT ` + userCols + ` FROM users` + where +
		` ORDER BY created_at DESC LIMIT $` + itoaParam(len(args))

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

func itoaParam(n int) string {
	// Same minimal helper as repository/audit.go — kept local to avoid
	// a circular import for one-line formatting.
	if n < 10 {
		return string([]byte{'0' + byte(n)})
	}
	return string([]byte{byte('0' + n/10), byte('0' + n%10)})
}
