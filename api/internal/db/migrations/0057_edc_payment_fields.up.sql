-- Add edc_debit + edc_kredit as valid POS payment methods, and EDC metadata
-- columns (bank brand, last 4 digits of card, EDC reference number,
-- bank approval code). Existing rows untouched — all new columns nullable.
ALTER TABLE pos_order_payments
    DROP CONSTRAINT IF EXISTS pos_order_payments_method_check;

ALTER TABLE pos_order_payments
    ADD CONSTRAINT pos_order_payments_method_check
    CHECK (method IN ('cash', 'qris', 'manual_transfer', 'midtrans', 'edc_debit', 'edc_kredit'));

ALTER TABLE pos_order_payments
    ADD COLUMN IF NOT EXISTS card_brand        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS card_last4        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reference_number  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS approval_code     TEXT NOT NULL DEFAULT '';
