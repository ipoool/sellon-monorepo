DROP INDEX IF EXISTS orders_store_idempotency_key_uniq;
ALTER TABLE orders
    DROP COLUMN IF EXISTS idempotency_key,
    DROP COLUMN IF EXISTS needs_review,
    DROP COLUMN IF EXISTS review_reason;
ALTER TABLE stores
    DROP COLUMN IF EXISTS offline_enabled;
