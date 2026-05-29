-- Track loyalty point redemption on the order itself, so the order detail
-- can show how much of discount_cents came from points (vs a manual discount)
-- without depending on the store's current redeem rate (which may change).
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INT    NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS loyalty_discount_cents  BIGINT NOT NULL DEFAULT 0;
