package repository

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrBulkJobNotFound = errors.New("bulk job not found")

type BulkJobRowError struct {
	Row     int    `json:"row"`
	Field   string `json:"field"`
	Message string `json:"message"`
}

type BulkJob struct {
	ID            uuid.UUID
	StoreID       uuid.UUID
	ActorUserID   *uuid.UUID
	Kind          string
	Filename      string
	Status        string // "running" | "completed" | "failed"
	TotalRows     int
	ProcessedRows int
	Succeeded     int
	Failed        int
	Errors        []BulkJobRowError
	ErrorMessage  string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	CompletedAt   *time.Time
}

type BulkJobRepo struct {
	pool *pgxpool.Pool
}

func NewBulkJobRepo(pool *pgxpool.Pool) *BulkJobRepo {
	return &BulkJobRepo{pool: pool}
}

const bulkJobCols = `id, store_id, actor_user_id, kind, filename, status,
	total_rows, processed_rows, succeeded, failed, errors_json,
	error_message, created_at, updated_at, completed_at`

type CreateBulkJobInput struct {
	StoreID     uuid.UUID
	ActorUserID *uuid.UUID
	Kind        string
	Filename    string
	TotalRows   int
}

// Create inserts a "running" job and returns the ID. Goroutine worker
// then drives UpdateProgress until it terminates the job via Complete
// or Fail.
func (r *BulkJobRepo) Create(ctx context.Context, in CreateBulkJobInput) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `
		INSERT INTO bulk_jobs (store_id, actor_user_id, kind, filename, total_rows)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, in.StoreID, in.ActorUserID, in.Kind, in.Filename, in.TotalRows).Scan(&id)
	return id, err
}

// UpdateProgress overwrites running-counters mid-job. Errors list grows
// monotonically; the caller passes the full slice each call.
func (r *BulkJobRepo) UpdateProgress(ctx context.Context, id uuid.UUID, processed, succeeded, failed int, errs []BulkJobRowError) error {
	if errs == nil {
		errs = []BulkJobRowError{}
	}
	errsJSON, err := json.Marshal(errs)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE bulk_jobs
		SET processed_rows = $2,
		    succeeded = $3,
		    failed = $4,
		    errors_json = $5::jsonb,
		    updated_at = now()
		WHERE id = $1
	`, id, processed, succeeded, failed, string(errsJSON))
	return err
}

// Complete marks the job terminal (status = completed) with final
// counters. errors-list update is idempotent with UpdateProgress; we
// rewrite it here so the final state is consistent in one row.
func (r *BulkJobRepo) Complete(ctx context.Context, id uuid.UUID, succeeded, failed int, errs []BulkJobRowError) error {
	if errs == nil {
		errs = []BulkJobRowError{}
	}
	errsJSON, err := json.Marshal(errs)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE bulk_jobs
		SET status = 'completed',
		    processed_rows = $2::int + $3::int,
		    succeeded = $2,
		    failed = $3,
		    errors_json = $4::jsonb,
		    updated_at = now(),
		    completed_at = now()
		WHERE id = $1
	`, id, succeeded, failed, string(errsJSON))
	return err
}

// Fail marks the job as failed with a top-level error message. Used
// when something blows up outside per-row processing (DB outage, etc).
func (r *BulkJobRepo) Fail(ctx context.Context, id uuid.UUID, msg string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE bulk_jobs
		SET status = 'failed',
		    error_message = $2,
		    updated_at = now(),
		    completed_at = now()
		WHERE id = $1
	`, id, msg)
	return err
}

// ListActive returns running jobs + recent completed/failed jobs for
// a store. Recent = updated_at >= now() - sinceMinutes. Used by the
// dashboard watcher to render persistent toasts.
func (r *BulkJobRepo) ListActive(ctx context.Context, storeID uuid.UUID, sinceMinutes int) ([]BulkJob, error) {
	if sinceMinutes <= 0 {
		sinceMinutes = 5
	}
	// Multiply int × interval instead of the older string-concat trick
	// `($2 || ' minutes')::interval` — pgx may bind $2 as int4 which
	// breaks the `||` (text concat) operator, producing intermittent 500s
	// on the dashboard's polling endpoint (NOISE-A).
	rows, err := r.pool.Query(ctx, `
		SELECT `+bulkJobCols+`
		FROM bulk_jobs
		WHERE store_id = $1
		  AND (status = 'running'
		       OR updated_at >= now() - ($2::int * interval '1 minute'))
		ORDER BY updated_at DESC
		LIMIT 20
	`, storeID, sinceMinutes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BulkJob
	for rows.Next() {
		j, err := scanBulkJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *j)
	}
	return out, rows.Err()
}

// Get fetches a single job by ID, scoped to a store for authorization.
func (r *BulkJobRepo) Get(ctx context.Context, storeID, id uuid.UUID) (*BulkJob, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+bulkJobCols+`
		FROM bulk_jobs
		WHERE id = $1 AND store_id = $2
	`, id, storeID)
	j, err := scanBulkJob(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBulkJobNotFound
	}
	return j, err
}

func scanBulkJob(row pgx.Row) (*BulkJob, error) {
	var j BulkJob
	var errsJSON []byte
	if err := row.Scan(
		&j.ID, &j.StoreID, &j.ActorUserID, &j.Kind, &j.Filename, &j.Status,
		&j.TotalRows, &j.ProcessedRows, &j.Succeeded, &j.Failed, &errsJSON,
		&j.ErrorMessage, &j.CreatedAt, &j.UpdatedAt, &j.CompletedAt,
	); err != nil {
		return nil, err
	}
	if len(errsJSON) > 0 {
		if err := json.Unmarshal(errsJSON, &j.Errors); err != nil {
			return nil, err
		}
	}
	if j.Errors == nil {
		j.Errors = []BulkJobRowError{}
	}
	return &j, nil
}
