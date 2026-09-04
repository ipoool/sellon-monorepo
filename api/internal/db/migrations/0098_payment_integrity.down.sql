DROP INDEX IF EXISTS products_store_created_idx;
DROP INDEX IF EXISTS orders_store_created_idx;

ALTER TABLE orders DROP COLUMN IF EXISTS refund_pending;

DROP INDEX IF EXISTS download_tokens_item_uniq;
