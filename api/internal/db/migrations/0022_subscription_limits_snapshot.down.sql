ALTER TABLE subscriptions
    DROP COLUMN IF EXISTS product_limit,
    DROP COLUMN IF EXISTS staff_limit,
    DROP COLUMN IF EXISTS order_monthly_limit,
    DROP COLUMN IF EXISTS promo_limit;
