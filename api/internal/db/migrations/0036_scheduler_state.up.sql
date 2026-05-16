-- Tracks the last successful run of each background scheduler job.
-- Used on restart to skip weeks that were already sent.
CREATE TABLE scheduler_state (
    job_name    TEXT        PRIMARY KEY,
    last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_run_week INT        NOT NULL,  -- ISO week number (1–53)
    last_run_year INT        NOT NULL
);
