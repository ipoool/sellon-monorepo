ALTER TABLE orders
    DROP COLUMN IF EXISTS refunded_at,
    DROP COLUMN IF EXISTS refund_reason,
    DROP COLUMN IF EXISTS refund_amount_cents;
