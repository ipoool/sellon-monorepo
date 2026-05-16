-- Extend product_layout CHECK to include 3 new layout options.
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_product_layout_check;
ALTER TABLE stores
  ADD CONSTRAINT stores_product_layout_check
  CHECK (product_layout IN ('grid', 'list', 'showcase', 'compact', 'magazine', 'feed', 'kiosk', 'katalog', 'poster'));
