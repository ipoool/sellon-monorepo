ALTER TABLE orders DROP COLUMN IF EXISTS customer_email;
DROP INDEX IF EXISTS download_tokens_order_idx;
DROP TABLE IF EXISTS download_tokens;
ALTER TABLE order_items DROP COLUMN IF EXISTS product_type;
DROP INDEX IF EXISTS products_type_idx;
ALTER TABLE products
    DROP COLUMN IF EXISTS digital_instructions,
    DROP COLUMN IF EXISTS digital_file_url,
    DROP COLUMN IF EXISTS digital_delivery_url,
    DROP COLUMN IF EXISTS product_type;
