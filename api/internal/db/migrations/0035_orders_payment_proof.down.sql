ALTER TABLE orders
    DROP COLUMN IF EXISTS payment_proof_url,
    DROP COLUMN IF EXISTS payment_proof_note,
    DROP COLUMN IF EXISTS payment_proof_at;
