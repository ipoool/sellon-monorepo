CREATE TABLE cash_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
    category    TEXT NOT NULL DEFAULT '',
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    occurred_on DATE NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_entries_store_date ON cash_entries (store_id, occurred_on);
