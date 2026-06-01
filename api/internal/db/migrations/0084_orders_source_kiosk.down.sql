-- Revert kiosk from the source CHECK. Demote any existing kiosk orders to
-- 'storefront' first so the tighter constraint re-applies cleanly.
UPDATE orders SET source = 'storefront' WHERE source = 'kiosk';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check
    CHECK (source IN ('storefront', 'pos', 'whatsapp'));
