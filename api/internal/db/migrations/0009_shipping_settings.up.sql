-- Per-store shipping settings:
--   * shipping_origin_city — overrides stores.city for ongkir zone calc
--     when the seller ships from a different warehouse city. Empty falls
--     back to stores.city.
--   * enabled_couriers — whitelist of courier codes (jne, jnt, sicepat,
--     anteraja, gosend, grabexpress). Empty array = all couriers shown.
--   * free_shipping_threshold_cents — when subtotal >= threshold, ongkir
--     is zeroed at quote time. 0 = disabled.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS shipping_origin_city          TEXT      NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS enabled_couriers              TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS free_shipping_threshold_cents BIGINT    NOT NULL DEFAULT 0;
