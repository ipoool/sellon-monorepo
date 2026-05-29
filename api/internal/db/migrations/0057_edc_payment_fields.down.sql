ALTER TABLE pos_order_payments
    DROP COLUMN IF EXISTS card_brand,
    DROP COLUMN IF EXISTS card_last4,
    DROP COLUMN IF EXISTS reference_number,
    DROP COLUMN IF EXISTS approval_code;

ALTER TABLE pos_order_payments
    DROP CONSTRAINT IF EXISTS pos_order_payments_method_check;

ALTER TABLE pos_order_payments
    ADD CONSTRAINT pos_order_payments_method_check
    CHECK (method IN ('cash', 'qris', 'manual_transfer', 'midtrans'));
