package repository

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PlatformAuditEntry struct {
	ID                 uuid.UUID
	ActorUserID        *uuid.UUID
	ActorEmail         string
	ActorName          string
	ImpersonatorUserID *uuid.UUID
	Action             string
	TargetUserID       *uuid.UUID
	TargetStoreID      *uuid.UUID
	Summary            string
	Metadata           map[string]any
	CreatedAt          time.Time
}

type PlatformAuditRepo struct {
	pool *pgxpool.Pool
}

func NewPlatformAuditRepo(pool *pgxpool.Pool) *PlatformAuditRepo {
	return &PlatformAuditRepo{pool: pool}
}

type PlatformAuditInput struct {
	ActorUserID        *uuid.UUID
	ActorEmail         string
	ActorName          string
	ImpersonatorUserID *uuid.UUID
	Action             string
	TargetUserID       *uuid.UUID
	TargetStoreID      *uuid.UUID
	Summary            string
	Metadata           map[string]any
}

func (r *PlatformAuditRepo) Log(ctx context.Context, in PlatformAuditInput) error {
	meta := in.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO platform_audit_log
		    (actor_user_id, actor_email, actor_name, impersonator_user_id,
		     action, target_user_id, target_store_id, summary, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
	`, in.ActorUserID, in.ActorEmail, in.ActorName, in.ImpersonatorUserID,
		in.Action, in.TargetUserID, in.TargetStoreID, in.Summary, string(metaBytes))
	return err
}

const platformAuditCols = `id, actor_user_id, actor_email, actor_name,
	impersonator_user_id, action, target_user_id, target_store_id,
	summary, metadata, created_at`

func scanPlatformAudit(row pgx.Row) (*PlatformAuditEntry, error) {
	var e PlatformAuditEntry
	var metaBytes []byte
	if err := row.Scan(
		&e.ID, &e.ActorUserID, &e.ActorEmail, &e.ActorName,
		&e.ImpersonatorUserID, &e.Action, &e.TargetUserID, &e.TargetStoreID,
		&e.Summary, &metaBytes, &e.CreatedAt,
	); err != nil {
		return nil, err
	}
	if len(metaBytes) > 0 {
		_ = json.Unmarshal(metaBytes, &e.Metadata)
	}
	if e.Metadata == nil {
		e.Metadata = map[string]any{}
	}
	return &e, nil
}

// ListByTargetUser returns admin actions taken against a specific user.
// Used by /admin/users/{id}/audit.
func (r *PlatformAuditRepo) ListByTargetUser(ctx context.Context, targetUserID uuid.UUID, limit int) ([]PlatformAuditEntry, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+platformAuditCols+`
		FROM platform_audit_log
		WHERE target_user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, targetUserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformAuditEntry
	for rows.Next() {
		e, err := scanPlatformAudit(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// ListAll returns the most recent admin actions, with optional action
// filter. Used by a future /admin/audit dashboard.
func (r *PlatformAuditRepo) ListAll(ctx context.Context, action string, limit int) ([]PlatformAuditEntry, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	args := []any{}
	q := `SELECT ` + platformAuditCols + ` FROM platform_audit_log`
	if strings.TrimSpace(action) != "" {
		args = append(args, action)
		q += ` WHERE action = $1`
	}
	args = append(args, limit)
	q += ` ORDER BY created_at DESC LIMIT $` + strconvParam(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformAuditEntry
	for rows.Next() {
		e, err := scanPlatformAudit(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func strconvParam(n int) string {
	if n < 10 {
		return string([]byte{'0' + byte(n)})
	}
	return string([]byte{byte('0' + n/10), byte('0' + n%10)})
}
