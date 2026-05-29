CREATE TABLE stock_takes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
    note       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_at  TIMESTAMPTZ
);
CREATE INDEX idx_stock_takes_store ON stock_takes (store_id, created_at DESC);

CREATE TABLE stock_take_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_take_id UUID NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
    material_id   UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    system_qty    BIGINT NOT NULL,
    counted_qty   BIGINT NOT NULL
);
CREATE INDEX idx_stock_take_items_take ON stock_take_items (stock_take_id);
