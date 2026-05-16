package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SchedulerStateRepo struct {
	pool *pgxpool.Pool
}

func NewSchedulerStateRepo(pool *pgxpool.Pool) *SchedulerStateRepo {
	return &SchedulerStateRepo{pool: pool}
}

// AlreadyRanThisWeek returns true if the given job has a recorded run
// for the given ISO week + year. Used on startup to skip duplicate sends.
func (r *SchedulerStateRepo) AlreadyRanThisWeek(ctx context.Context, jobName string, week, year int) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT 1 FROM scheduler_state
		 WHERE job_name = $1 AND last_run_week = $2 AND last_run_year = $3
		 LIMIT 1`,
		jobName, week, year,
	).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// MarkRan upserts a completed run record for the given job and week.
func (r *SchedulerStateRepo) MarkRan(ctx context.Context, jobName string, week, year int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO scheduler_state (job_name, last_run_week, last_run_year, last_run_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (job_name) DO UPDATE
		  SET last_run_week = EXCLUDED.last_run_week,
		      last_run_year = EXCLUDED.last_run_year,
		      last_run_at   = EXCLUDED.last_run_at`,
		jobName, week, year,
	)
	return err
}
