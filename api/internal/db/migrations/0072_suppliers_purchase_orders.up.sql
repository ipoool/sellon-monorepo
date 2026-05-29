CREATE TABLE suppliers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_suppliers_store ON suppliers (store_id) WHERE is_active;

CREATE TABLE purchase_orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','received','cancelled')),
    note        TEXT NOT NULL DEFAULT '',
    total_cents BIGINT NOT NULL DEFAULT 0,
    ordered_at  TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_orders_store ON purchase_orders (store_id, created_at DESC);

CREATE TABLE purchase_order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
    quantity        BIGINT NOT NULL CHECK (quantity > 0),
    unit_cost_cents BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_po_items_po ON purchase_order_items (po_id);
