ALTER TABLE stores
    DROP COLUMN IF EXISTS free_shipping_threshold_cents,
    DROP COLUMN IF EXISTS enabled_couriers,
    DROP COLUMN IF EXISTS shipping_origin_city;
