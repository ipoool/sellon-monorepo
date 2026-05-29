ALTER TABLE customers DROP COLUMN IF EXISTS loyalty_points;
ALTER TABLE stores
    DROP COLUMN IF EXISTS loyalty_enabled,
    DROP COLUMN IF EXISTS loyalty_earn_rate_cents,
    DROP COLUMN IF EXISTS loyalty_redeem_rate_cents;
