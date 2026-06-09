DROP TABLE IF EXISTS buyer_otps;
DROP TABLE IF EXISTS course_videos;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_type_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_type_check
    CHECK (product_type IN ('physical', 'digital'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('physical', 'digital'));
