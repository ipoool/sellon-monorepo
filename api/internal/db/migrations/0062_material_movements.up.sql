-- Ledger of every material stock change. This is the source of truth for the
-- consumption report (movement_type='consume', linked to the order line) and
-- doubles as restock history. unit_cost_cents is a SNAPSHOT of the material's
-- cost at movement time, so later recipe edits / restocks never rewrite
-- historical report numbers. quantity is signed: +restock, -consume.
CREATE TABLE IF NOT EXISTS material_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    movement_type   TEXT NOT NULL CHECK (movement_type IN ('restock', 'consume', 'adjust')),
    quantity        BIGINT NOT NULL,
    unit_cost_cents BIGINT NOT NULL DEFAULT 0,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    order_item_id   UUID REFERENCES order_items(id) ON DELETE SET NULL,
    note            TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS material_movements_material_idx ON material_movements (material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS material_movements_store_consume_idx ON material_movements (store_id, created_at) WHERE movement_type = 'consume';
CREATE INDEX IF NOT EXISTS material_movements_order_idx ON material_movements (order_id);
