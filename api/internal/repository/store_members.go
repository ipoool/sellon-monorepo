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

type Role string

const (
	RoleOwner Role = "owner"
	RoleAdmin Role = "admin"
	RoleStaff Role = "staff"
)

type StoreMember struct {
	ID        uuid.UUID
	StoreID   uuid.UUID
	UserID    uuid.UUID
	Role      Role
	CreatedAt time.Time
	UpdatedAt time.Time

	// Populated by joined queries (ListByStore).
	UserEmail   string
	UserName    string
	UserPicture string
}

type StoreInvite struct {
	ID         uuid.UUID
	StoreID    uuid.UUID
	Email      string
	Role       Role
	InvitedBy  *uuid.UUID
	AcceptedAt *time.Time
	CreatedAt  time.Time
	ExpiresAt  time.Time
}

type MembershipRepo struct {
	pool *pgxpool.Pool
}

func NewMembershipRepo(pool *pgxpool.Pool) *MembershipRepo {
	return &MembershipRepo{pool: pool}
}

var ErrMembershipNotFound = errors.New("membership not found")

// AddMember inserts a member; idempotent via ON CONFLICT DO UPDATE on role.
func (r *MembershipRepo) AddMember(ctx context.Context, storeID, userID uuid.UUID, role Role) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO store_members (store_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (store_id, user_id) DO UPDATE
		SET role = EXCLUDED.role, updated_at = now()
	`, storeID, userID, string(role))
	return err
}

// RoleFor returns the role of a user in a store, or "" + ErrMembershipNotFound.
func (r *MembershipRepo) RoleFor(ctx context.Context, storeID, userID uuid.UUID) (Role, error) {
	var role string
	err := r.pool.QueryRow(ctx,
		`SELECT role FROM store_members WHERE store_id = $1 AND user_id = $2`,
		storeID, userID,
	).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrMembershipNotFound
	}
	if err != nil {
		return "", err
	}
	return Role(role), nil
}

// ListByStore — members joined with users for display.
func (r *MembershipRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]StoreMember, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.id, m.store_id, m.user_id, m.role, m.created_at, m.updated_at,
		       COALESCE(u.email, ''), COALESCE(u.name, ''), COALESCE(u.picture_url, '')
		FROM store_members m
		LEFT JOIN users u ON u.id = m.user_id
		WHERE m.store_id = $1
		ORDER BY (m.role = 'owner') DESC, m.created_at ASC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StoreMember
	for rows.Next() {
		var m StoreMember
		var role string
		if err := rows.Scan(
			&m.ID, &m.StoreID, &m.UserID, &role, &m.CreatedAt, &m.UpdatedAt,
			&m.UserEmail, &m.UserName, &m.UserPicture,
		); err != nil {
			return nil, err
		}
		m.Role = Role(role)
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *MembershipRepo) Remove(ctx context.Context, storeID, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM store_members WHERE store_id = $1 AND user_id = $2 AND role <> 'owner'`,
		storeID, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMembershipNotFound
	}
	return nil
}

func (r *MembershipRepo) ChangeRole(ctx context.Context, storeID, userID uuid.UUID, role Role) error {
	if role == RoleOwner {
		return errors.New("tidak bisa promote ke owner — owner tetap pemilik akun")
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE store_members SET role = $3, updated_at = now()
		WHERE store_id = $1 AND user_id = $2 AND role <> 'owner'
	`, storeID, userID, string(role))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMembershipNotFound
	}
	return nil
}

// === Invites ===

// CreateInvite for an email. If the email already has a registered user
// AND that user already has a membership somewhere, the caller should
// detect that and call AddMember directly. CreateInvite is for the case
// where the user hasn't registered yet.
func (r *MembershipRepo) CreateInvite(ctx context.Context, storeID uuid.UUID, email string, role Role, invitedBy uuid.UUID) (*StoreInvite, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return nil, errors.New("email kosong")
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO store_invites (store_id, email, role, invited_by, expires_at)
		VALUES ($1, $2, $3, $4, now() + interval '7 days')
		RETURNING id, store_id, email, role, invited_by, accepted_at, created_at, expires_at
	`, storeID, email, string(role), invitedBy)
	var inv StoreInvite
	var roleStr string
	if err := row.Scan(&inv.ID, &inv.StoreID, &inv.Email, &roleStr,
		&inv.InvitedBy, &inv.AcceptedAt, &inv.CreatedAt, &inv.ExpiresAt); err != nil {
		return nil, err
	}
	inv.Role = Role(roleStr)
	return &inv, nil
}

// GetUserStoreRole returns the store-level role of a user across any store.
// Used by auth/me to expose store_role without requiring a store ID.
// Returns ("", "", ErrMembershipNotFound) if the user has no store membership.
func (r *MembershipRepo) GetUserStoreRole(ctx context.Context, userID uuid.UUID) (storeID uuid.UUID, role Role, err error) {
	var roleStr string
	err = r.pool.QueryRow(ctx,
		`SELECT store_id, role FROM store_members WHERE user_id = $1 LIMIT 1`,
		userID,
	).Scan(&storeID, &roleStr)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.UUID{}, "", ErrMembershipNotFound
	}
	if err != nil {
		return uuid.UUID{}, "", err
	}
	return storeID, Role(roleStr), nil
}

// HasPendingInvite returns true if there is already a non-expired, unaccepted
// invite for this email in the given store.
func (r *MembershipRepo) HasPendingInvite(ctx context.Context, storeID uuid.UUID, email string) (bool, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
		    SELECT 1 FROM store_invites
		    WHERE store_id = $1
		      AND LOWER(email) = $2
		      AND accepted_at IS NULL
		      AND expires_at > now()
		)
	`, storeID, email).Scan(&exists)
	return exists, err
}

func (r *MembershipRepo) ListInvitesByStore(ctx context.Context, storeID uuid.UUID) ([]StoreInvite, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, email, role, invited_by, accepted_at, created_at, expires_at
		FROM store_invites
		WHERE store_id = $1 AND accepted_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StoreInvite
	for rows.Next() {
		var inv StoreInvite
		var role string
		if err := rows.Scan(&inv.ID, &inv.StoreID, &inv.Email, &role,
			&inv.InvitedBy, &inv.AcceptedAt, &inv.CreatedAt, &inv.ExpiresAt); err != nil {
			return nil, err
		}
		inv.Role = Role(role)
		out = append(out, inv)
	}
	return out, rows.Err()
}

func (r *MembershipRepo) DeleteInvite(ctx context.Context, storeID, inviteID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM store_invites WHERE store_id = $1 AND id = $2`,
		storeID, inviteID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMembershipNotFound
	}
	return nil
}

// AcceptInvitesForEmail is called from the auth handler on every login.
// Finds all open invites matching this user's email and converts them into
// store_members rows. Returns count accepted.
func (r *MembershipRepo) AcceptInvitesForEmail(ctx context.Context, userID uuid.UUID, email string) (int, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return 0, nil
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT id, store_id, role FROM store_invites
		WHERE LOWER(email) = $1 AND accepted_at IS NULL AND expires_at > now()
	`, email)
	if err != nil {
		return 0, err
	}
	type pending struct {
		id, storeID uuid.UUID
		role        string
	}
	var pendings []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.storeID, &p.role); err != nil {
			rows.Close()
			return 0, err
		}
		pendings = append(pendings, p)
	}
	rows.Close()

	for _, p := range pendings {
		if _, err := tx.Exec(ctx, `
			INSERT INTO store_members (store_id, user_id, role)
			VALUES ($1, $2, $3)
			ON CONFLICT (store_id, user_id) DO UPDATE
			SET role = EXCLUDED.role, updated_at = now()
		`, p.storeID, userID, p.role); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE store_invites SET accepted_at = now() WHERE id = $1`,
			p.id,
		); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(pendings), nil
}
