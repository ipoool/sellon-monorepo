-- Manual cash in/out during a shift (e.g., taking money out for supplies,
-- adding extra float). Recorded per session so the close-shift reconciliation
-- can show expected vs actual cash.
CREATE TABLE IF NOT EXISTS pos_cash_movements (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pos_session_id UUID        NOT NULL REFERENCES pos_sessions(id) ON DELETE CASCADE,
    store_id       UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES users(id),
    type           TEXT        NOT NULL CHECK (type IN ('in', 'out')),
    amount_cents   BIGINT      NOT NULL CHECK (amount_cents > 0),
    reason         TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_cash_movements_session_idx ON pos_cash_movements (pos_session_id);
