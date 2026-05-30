-- Cache for Analytics 360 AI summaries. Keyed by a hash of the exact data fed
-- to the model (input_hash) so an unchanged dataset reuses the cached result
-- instead of calling Claude again; new orders change the input → new hash →
-- fresh summary. period_from/period_to are kept for display + auditing.
CREATE TABLE IF NOT EXISTS analytics_ai_summaries (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    period_from DATE        NOT NULL,
    period_to   DATE        NOT NULL,
    input_hash  TEXT        NOT NULL,
    summary     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast cache lookup by store + data fingerprint.
CREATE INDEX IF NOT EXISTS idx_analytics_ai_summaries_lookup
    ON analytics_ai_summaries (store_id, input_hash);

-- Existence probe for "first ever summary" (drives the one-time email).
CREATE INDEX IF NOT EXISTS idx_analytics_ai_summaries_store
    ON analytics_ai_summaries (store_id, created_at);
