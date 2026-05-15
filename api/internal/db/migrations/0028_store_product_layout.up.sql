-- Pilihan layout grid produk di halaman storefront publik.
--   grid     → multi-kolom card sama besar (default, current behavior)
--   list     → satu kolom, thumbnail kecil + info di samping (compact)
--   showcase → produk pertama hero full-width, sisanya grid 2 kolom
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS product_layout TEXT NOT NULL DEFAULT 'grid'
        CHECK (product_layout IN ('grid', 'list', 'showcase'));
