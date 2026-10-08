-- Stores on the landing template fall back to grid so the narrower CHECK can
-- be reinstated.
UPDATE stores SET product_layout = 'grid' WHERE product_layout = 'landing';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_product_layout_check;
ALTER TABLE stores
  ADD CONSTRAINT stores_product_layout_check
  CHECK (product_layout IN ('grid', 'list', 'showcase', 'compact', 'magazine', 'feed', 'kiosk', 'katalog', 'poster'));
