-- POS shift sessions. Multi-shift per user: each cashier opens their own
-- shift when starting their workday. App layer enforces "at most one open
-- session per (store_id, opened_by)" before opening a new one.
CREATE TABLE IF NOT EXISTS pos_sessions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    opened_by           UUID        NOT NULL REFERENCES users(id),
    closed_by           UUID        REFERENCES users(id),
    opening_cash_cents  BIGINT      NOT NULL DEFAULT 0,
    closing_cash_cents  BIGINT,
    expected_cash_cents BIGINT,
    notes               TEXT        NOT NULL DEFAULT '',
    status              TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_sessions_store_status_idx ON pos_sessions (store_id, status);
CREATE INDEX IF NOT EXISTS pos_sessions_opened_by_idx    ON pos_sessions (opened_by);
