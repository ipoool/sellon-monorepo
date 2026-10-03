ALTER TABLE products DROP CONSTRAINT IF EXISTS products_compare_at_price_cents_check;
ALTER TABLE products DROP COLUMN IF EXISTS compare_at_price_cents;
