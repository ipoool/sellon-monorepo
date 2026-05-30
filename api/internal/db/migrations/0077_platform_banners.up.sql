-- Platform-managed promo/info banners shown as a slider on the seller
-- dashboard. Managed by SellOn admins (image + optional click link); sellers
-- only consume the active ones. Not tenant-scoped — these are global to the
-- platform.
CREATE TABLE IF NOT EXISTS platform_banners (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url  TEXT    NOT NULL,
    image_path TEXT    NOT NULL DEFAULT '', -- storage object path, for cleanup on delete
    title      TEXT    NOT NULL DEFAULT '', -- alt text / internal label
    link_url   TEXT    NOT NULL DEFAULT '', -- optional click-through target
    is_active  BOOLEAN NOT NULL DEFAULT true,
    sort_order INT     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_banners_active_idx
    ON platform_banners (is_active, sort_order, created_at);
