-- bulk_jobs: durable tracking untuk async bulk-upload produk.
-- Setiap upload XLSX yang lulus validasi awal jadi 1 row di tabel ini.
-- Goroutine worker meng-update `processed_rows`, `succeeded`, `failed`,
-- dan `errors_json` saat memproses tiap baris. Frontend poll status
-- via GET /products/bulk/jobs/active.
CREATE TABLE IF NOT EXISTS bulk_jobs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID            NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    actor_user_id   UUID            REFERENCES users(id) ON DELETE SET NULL,
    kind            TEXT            NOT NULL,    -- "products" untuk sekarang; future: "customers", etc.
    filename        TEXT            NOT NULL DEFAULT '',
    status          TEXT            NOT NULL DEFAULT 'running',  -- running | completed | failed
    total_rows      INT             NOT NULL DEFAULT 0,
    processed_rows  INT             NOT NULL DEFAULT 0,
    succeeded       INT             NOT NULL DEFAULT 0,
    failed          INT             NOT NULL DEFAULT 0,
    errors_json     JSONB           NOT NULL DEFAULT '[]'::jsonb,
    error_message   TEXT            NOT NULL DEFAULT '',  -- top-level error kalau status=failed
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- Index untuk endpoint "active jobs": store_id + status running + recent
-- completed (untuk show toast hasil sampai user dismiss).
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_store_status_updated
    ON bulk_jobs (store_id, status, updated_at DESC);
