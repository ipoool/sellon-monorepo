-- RajaOngkir uses integer city IDs for /cost calls. We store the seller's
-- origin city ID so the storefront shipping handler can pass it directly
-- to the API instead of free-text matching.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS shipping_origin_city_id   TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS shipping_origin_city_name TEXT NOT NULL DEFAULT '';
