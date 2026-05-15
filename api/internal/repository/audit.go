package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditEntry struct {
	ID                 uuid.UUID
	StoreID            uuid.UUID
	ActorUserID        *uuid.UUID
	ActorEmail         string
	ActorName          string
	ImpersonatorUserID *uuid.UUID
	Action             string
	EntityType         string
	EntityID           string
	Summary            string
	Metadata           map[string]any
	CreatedAt          time.Time
}

type AuditRepo struct {
	pool *pgxpool.Pool
}

func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo {
	return &AuditRepo{pool: pool}
}

type AuditInput struct {
	StoreID            uuid.UUID
	ActorUserID        *uuid.UUID
	ActorEmail         string
	ActorName          string
	ImpersonatorUserID *uuid.UUID
	Action             string
	EntityType         string
	EntityID           string
	Summary            string
	Metadata           map[string]any
}

// Log records an audit entry. Errors are returned but callers typically
// log-and-continue: a failed audit insert should never block the user's
// real action.
func (r *AuditRepo) Log(ctx context.Context, in AuditInput) error {
	meta := in.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_log
		    (store_id, actor_user_id, actor_email, actor_name,
		     impersonator_user_id,
		     action, entity_type, entity_id, summary, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
	`,
		in.StoreID, in.ActorUserID, in.ActorEmail, in.ActorName,
		in.ImpersonatorUserID,
		in.Action, in.EntityType, in.EntityID, in.Summary, string(metaBytes),
	)
	return err
}

const auditCols = `id, store_id, actor_user_id, actor_email, actor_name,
	impersonator_user_id,
	action, entity_type, entity_id, summary, metadata, created_at`

// AuditListFilter narrows the result set. Zero values mean "no filter
// on this dimension" — Action="" returns all actions, since/until nil
// means unbounded on that side. `before` is the pagination cursor
// (timestamp of the last entry in the previous page).
type AuditListFilter struct {
	Action string
	Limit  int
	Before *time.Time
	Since  *time.Time
	Until  *time.Time
}

// List returns the most recent entries for a store. Limit clamps to
// [1, 200].
func (r *AuditRepo) List(ctx context.Context, storeID uuid.UUID, f AuditListFilter) ([]AuditEntry, error) {
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{storeID}
	q := `SELECT ` + auditCols + ` FROM audit_log WHERE store_id = $1`
	if f.Action != "" {
		args = append(args, f.Action)
		q += ` AND action = $` + intToParam(len(args))
	}
	if f.Since != nil {
		args = append(args, *f.Since)
		q += ` AND created_at >= $` + intToParam(len(args))
	}
	if f.Until != nil {
		args = append(args, *f.Until)
		q += ` AND created_at <= $` + intToParam(len(args))
	}
	if f.Before != nil {
		args = append(args, *f.Before)
		q += ` AND created_at < $` + intToParam(len(args))
	}
	args = append(args, limit)
	q += ` ORDER BY created_at DESC LIMIT $` + intToParam(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditEntry
	for rows.Next() {
		e, err := scanAudit(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func scanAudit(row pgx.Row) (*AuditEntry, error) {
	var e AuditEntry
	var metaBytes []byte
	if err := row.Scan(
		&e.ID, &e.StoreID, &e.ActorUserID, &e.ActorEmail, &e.ActorName,
		&e.ImpersonatorUserID,
		&e.Action, &e.EntityType, &e.EntityID, &e.Summary, &metaBytes, &e.CreatedAt,
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

// intToParam renders a small positive int as a bare digit string
// ("1", "2", …) for splicing into a Postgres placeholder. Caller
// prefixes the literal `$`. Earlier this returned `$1` itself, which
// double-prefixed to `$$1` and crashed the query.
func intToParam(n int) string {
	if n <= 0 {
		return "1"
	}
	if n < 10 {
		return string([]byte{byte('0' + n)})
	}
	// 10–99 covers our needs; if the args list ever exceeds this, the
	// caller will panic-style fail at query time (Postgres will reject).
	return string([]byte{byte('0' + n/10), byte('0' + n%10)})
}
