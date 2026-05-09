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
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

// FindOrCreateByGoogleID upserts on google_id. Returns the user row whether
// it was newly inserted or already existed. Email/name/picture are refreshed
// every login so profile changes propagate.
func (r *UserRepo) FindOrCreateByGoogleID(ctx context.Context, googleID, email, name, pictureURL string) (*User, error) {
	const q = `
		INSERT INTO users (google_id, email, name, picture_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (google_id) DO UPDATE
		SET email = EXCLUDED.email,
		    name = EXCLUDED.name,
		    picture_url = EXCLUDED.picture_url,
		    updated_at = now()
		RETURNING id, google_id, email, name, picture_url, created_at, updated_at
	`
	var u User
	err := r.pool.QueryRow(ctx, q, googleID, email, name, pictureURL).Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.PictureURL, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) FindByID(ctx context.Context, id uuid.UUID) (*User, error) {
	const q = `
		SELECT id, google_id, email, name, picture_url, created_at, updated_at
		FROM users WHERE id = $1
	`
	var u User
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.PictureURL, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// FindByEmail looks up a user by lowercased email — used by the staff
// invite flow to detect when an invitee already has an account.
func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	const q = `
		SELECT id, google_id, email, name, picture_url, created_at, updated_at
		FROM users WHERE LOWER(email) = $1
		LIMIT 1
	`
	var u User
	err := r.pool.QueryRow(ctx, q, email).Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.PictureURL, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
