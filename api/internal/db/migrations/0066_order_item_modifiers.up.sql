-- Snapshot of the modifier options chosen for an order line. Stores names +
-- price delta at sale time so receipts/history stay correct even if the
-- product's options are later edited. option_id kept (nullable) for traceback.
CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id     UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    option_id         UUID REFERENCES product_modifier_options(id) ON DELETE SET NULL,
    group_name        TEXT NOT NULL DEFAULT '',
    option_name       TEXT NOT NULL,
    price_delta_cents BIGINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_item_modifiers_item_idx ON order_item_modifiers (order_item_id);
