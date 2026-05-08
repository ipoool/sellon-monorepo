-- Per-product threshold for "stok rendah" alert. 0 means disabled.
ALTER TABLE products
    ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 0;
