ALTER TABLE order_items
    DROP COLUMN IF EXISTS reseller_catalog_id,
    DROP COLUMN IF EXISTS supplier_store_id,
    DROP COLUMN IF EXISTS reseller_cost_cents;
