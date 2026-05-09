ALTER TABLE orders
    DROP COLUMN IF EXISTS discount_cents,
    DROP COLUMN IF EXISTS promo_id,
    DROP COLUMN IF EXISTS promo_code;
