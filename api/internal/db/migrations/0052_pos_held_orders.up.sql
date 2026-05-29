-- Carts that cashier has set aside ("Meja 3", "Pak Budi") to be restored
-- later. Auto-cleaned when session is closed (CASCADE on session delete).
CREATE TABLE IF NOT EXISTS pos_held_orders (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id       UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    pos_session_id UUID        NOT NULL REFERENCES pos_sessions(id) ON DELETE CASCADE,
    held_by        UUID        NOT NULL REFERENCES users(id),
    label          TEXT        NOT NULL DEFAULT '',
    cart_snapshot  JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_held_orders_session_idx ON pos_held_orders (pos_session_id);
