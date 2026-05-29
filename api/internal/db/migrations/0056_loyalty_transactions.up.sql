-- Audit trail of all loyalty point movements. Signed: positive = earn, negative = redeem.
-- balance_after captures the running balance for easy historical browsing.
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id      UUID        REFERENCES orders(id) ON DELETE SET NULL,
    type          TEXT        NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
    points        INT         NOT NULL,  -- signed
    balance_after INT         NOT NULL,
    reason        TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loyalty_transactions_customer_idx ON loyalty_transactions (customer_id);
CREATE INDEX IF NOT EXISTS loyalty_transactions_store_idx    ON loyalty_transactions (store_id);
