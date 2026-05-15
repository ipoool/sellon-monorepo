-- Extend product_layout CHECK supaya menerima 3 opsi tambahan.
--   compact  → grid sangat dense 4-6 kolom dengan thumbnail kecil
--   magazine → asymmetric: produk pertama besar, dua kecil di sisi
--   feed     → satu kolom Instagram-style, foto square besar
ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_product_layout_check;

ALTER TABLE stores
    ADD CONSTRAINT stores_product_layout_check
    CHECK (product_layout IN ('grid', 'list', 'showcase', 'compact', 'magazine', 'feed'));
