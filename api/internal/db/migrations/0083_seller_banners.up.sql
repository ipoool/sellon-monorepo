-- Seller-owned promotional banners, scoped per store and per placement
-- (storefront hero strip, table-order page, customer queue display). Distinct
-- from platform_banners (admin-managed, global to the dashboard slider).
CREATE TABLE IF NOT EXISTS seller_banners (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    placement  TEXT        NOT NULL CHECK (placement IN ('storefront', 'table_order', 'customer_queue')),
    image_url  TEXT        NOT NULL,
    image_path TEXT        NOT NULL DEFAULT '', -- storage object path for cleanup
    title      TEXT        NOT NULL DEFAULT '', -- internal label / alt text
    link_url   TEXT        NOT NULL DEFAULT '', -- optional click-through
    is_active  BOOLEAN     NOT NULL DEFAULT true,
    sort_order INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public consumption: active banners for a store + placement, in display order.
CREATE INDEX IF NOT EXISTS seller_banners_lookup
    ON seller_banners (store_id, placement, is_active, sort_order);
