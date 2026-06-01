-- Allow kiosk-channel orders: anonymous in-store self-order from the kiosk
-- product layout. Extends the orders.source CHECK; existing rows/values are
-- unchanged. The inline CHECK from 0053 is auto-named orders_source_check.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check
    CHECK (source IN ('storefront', 'pos', 'whatsapp', 'kiosk'));
