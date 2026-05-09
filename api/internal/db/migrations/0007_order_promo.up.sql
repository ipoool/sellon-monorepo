-- Track promo code redemption per order. discount_cents is applied to
-- the subtotal (or shipping for free_shipping promos) before total_cents.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS promo_code     TEXT   NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS promo_id       UUID   REFERENCES promos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS discount_cents BIGINT NOT NULL DEFAULT 0;
