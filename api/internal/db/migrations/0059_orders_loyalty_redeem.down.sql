ALTER TABLE orders
    DROP COLUMN IF EXISTS loyalty_points_redeemed,
    DROP COLUMN IF EXISTS loyalty_discount_cents;
