ALTER TABLE stores
    DROP COLUMN IF EXISTS shipping_origin_city_name,
    DROP COLUMN IF EXISTS shipping_origin_city_id;
