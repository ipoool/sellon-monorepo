-- "Landing" storefront template: a section-based home page (announcement bar,
-- hero slider, product rows, promo banners, text) composed by the seller in
-- Pengaturan → Storefront. Its config lives in layout_config.landing; this
-- only widens the allowed product_layout values. The Go allowlist in
-- repository/stores.go must match this list — the Go side degrades to
-- "grid", the constraint rejects the row.
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_product_layout_check;
ALTER TABLE stores
  ADD CONSTRAINT stores_product_layout_check
  CHECK (product_layout IN ('grid', 'list', 'showcase', 'compact', 'magazine', 'feed', 'kiosk', 'katalog', 'poster', 'landing'));
