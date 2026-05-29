ALTER TABLE orders
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS pos_session_id,
    DROP COLUMN IF EXISTS change_amount_cents;
