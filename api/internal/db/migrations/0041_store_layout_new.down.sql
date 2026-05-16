ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_product_layout_check;
ALTER TABLE stores
  ADD CONSTRAINT stores_product_layout_check
  CHECK (product_layout IN ('grid', 'list', 'showcase', 'compact', 'magazine', 'feed'));
-- Reset any stores using new layouts back to grid.
UPDATE stores SET product_layout = 'grid'
WHERE product_layout NOT IN ('grid', 'list', 'showcase', 'compact', 'magazine', 'feed');
