-- Storefront polish: hero banner image + short tagline on the store, plus
-- a featured flag on products that lets sellers pin items to the top of
-- their public catalog.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS banner_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS tagline    TEXT NOT NULL DEFAULT '';

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_featured_idx
    ON products (store_id) WHERE is_featured = true;
