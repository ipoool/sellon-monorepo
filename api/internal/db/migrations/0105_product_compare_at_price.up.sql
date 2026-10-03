-- "Harga coret": the pre-discount price shown struck through next to the
-- real one, so a buyer can see Rp 90.000 against a Rp 100.000 original.
--
-- DISPLAY ONLY. Nothing prices an order from this column — the charged
-- amount still comes from price_cents (or the variant's own price), so a
-- wrong value here can mislead a shopper but can never mis-bill one.
--
-- 0 means "no discount shown", which is why this is NOT NULL DEFAULT 0
-- rather than nullable: every existing product reads as "no discount"
-- without a backfill, and the display rule is a single comparison.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS compare_at_price_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_compare_at_price_cents_check;
ALTER TABLE products
    ADD CONSTRAINT products_compare_at_price_cents_check
    CHECK (compare_at_price_cents >= 0);
