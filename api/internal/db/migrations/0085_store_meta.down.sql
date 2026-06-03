ALTER TABLE stores
    DROP COLUMN IF EXISTS meta_enabled,
    DROP COLUMN IF EXISTS meta_pixel_id,
    DROP COLUMN IF EXISTS meta_access_token_encrypted,
    DROP COLUMN IF EXISTS meta_test_event_code,
    DROP COLUMN IF EXISTS meta_catalog_id;
