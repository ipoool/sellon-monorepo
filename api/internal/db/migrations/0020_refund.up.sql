-- Refund metadata. SellOn is a facilitator: the actual money movement
-- happens out of band (seller's Midtrans dashboard or manual transfer).
-- These columns just record that the refund was acknowledged + how much
-- + why, so the dashboard, audit log, and reports stay consistent.
--
-- payment_status='refunded' was already in the CHECK constraint from
-- 0002, but no metadata existed to back it up.

ALTER TABLE orders
    ADD COLUMN refund_amount_cents bigint NOT NULL DEFAULT 0,
    ADD COLUMN refund_reason text NOT NULL DEFAULT '',
    ADD COLUMN refunded_at timestamptz;
