-- Per-seller Meta (Facebook) integration config. Opt-in, mirrors the Midtrans
-- credential pattern: pixel id is browser-public, the Conversions API access
-- token is stored AES-GCM encrypted (NULL when unset). Catalog uses a public
-- pull-feed URL (no token needed); catalog_id recorded for reference only.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS meta_enabled                 BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS meta_pixel_id                TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS meta_access_token_encrypted  BYTEA,
    ADD COLUMN IF NOT EXISTS meta_test_event_code         TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS meta_catalog_id              TEXT    NOT NULL DEFAULT '';
