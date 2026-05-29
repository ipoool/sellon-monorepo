-- Per-store loyalty config + per-customer points balance.
-- earn_rate_cents: 1 point earned per X cents spent (e.g. 100_000 = 1 point per Rp 1.000)
-- redeem_rate_cents: 1 point = Y cents discount when redeemed (e.g. 1_000_000 = 1 point = Rp 100)
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS loyalty_enabled           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS loyalty_earn_rate_cents   BIGINT  NOT NULL DEFAULT 100000,  -- Rp 1.000 = 1 point
    ADD COLUMN IF NOT EXISTS loyalty_redeem_rate_cents BIGINT  NOT NULL DEFAULT 100000;  -- 1 point = Rp 1.000

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS loyalty_points INT NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0);

CREATE INDEX IF NOT EXISTS customers_loyalty_points_idx
    ON customers (store_id) WHERE loyalty_points > 0;
