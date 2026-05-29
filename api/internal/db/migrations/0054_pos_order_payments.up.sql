-- Split payment support: a single POS order can be paid with multiple
-- methods (e.g., cash + QRIS). For single-method orders we still write one
-- row here for consistency. orders.payment_method holds the primary method
-- or "pos_split" when multiple methods are used.
CREATE TABLE IF NOT EXISTS pos_order_payments (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method       TEXT        NOT NULL CHECK (method IN ('cash', 'qris', 'manual_transfer', 'midtrans')),
    amount_cents BIGINT      NOT NULL CHECK (amount_cents > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_order_payments_order_idx ON pos_order_payments (order_id);
