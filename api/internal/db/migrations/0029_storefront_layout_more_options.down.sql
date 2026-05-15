-- Reset rows yang pakai opsi baru ke 'grid' supaya constraint lama
-- (cuma 3 nilai) tidak reject.
UPDATE stores SET product_layout = 'grid'
    WHERE product_layout IN ('compact', 'magazine', 'feed');

ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_product_layout_check;

ALTER TABLE stores
    ADD CONSTRAINT stores_product_layout_check
    CHECK (product_layout IN ('grid', 'list', 'showcase'));
