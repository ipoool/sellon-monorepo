DROP INDEX IF EXISTS products_featured_idx;

ALTER TABLE products
    DROP COLUMN IF EXISTS is_featured;

ALTER TABLE stores
    DROP COLUMN IF EXISTS tagline,
    DROP COLUMN IF EXISTS banner_url;
