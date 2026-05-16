CREATE TABLE ai_insights (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id     UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    insight_json TEXT        NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    UNIQUE (store_id)
);
