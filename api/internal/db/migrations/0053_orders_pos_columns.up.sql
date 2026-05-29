-- Extend orders for POS support. Existing rows default to source='storefront'
-- which preserves current behavior. POS orders set source='pos' + link to
-- pos_session_id. change_amount_cents records cash given back to the customer
-- (only relevant for cash payments).
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS source              TEXT   NOT NULL DEFAULT 'storefront'
        CHECK (source IN ('storefront', 'pos', 'whatsapp')),
    ADD COLUMN IF NOT EXISTS pos_session_id      UUID   REFERENCES pos_sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS change_amount_cents BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS orders_pos_session_idx
    ON orders (pos_session_id) WHERE pos_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_source_idx ON orders (source);
