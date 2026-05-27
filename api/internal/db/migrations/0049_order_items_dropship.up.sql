-- Extend order_items with dropship tracking fields.
-- NULL supplier_store_id = regular item owned by the seller.
-- Non-NULL = dropship item sourced from a supplier via reseller_catalog.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS reseller_catalog_id UUID        REFERENCES reseller_catalog(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS supplier_store_id   UUID        REFERENCES stores(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reseller_cost_cents BIGINT      NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS order_items_supplier_idx
    ON order_items (supplier_store_id) WHERE supplier_store_id IS NOT NULL;
