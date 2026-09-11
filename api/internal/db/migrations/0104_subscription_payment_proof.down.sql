ALTER TABLE subscription_invoices
    DROP COLUMN IF EXISTS payment_proof_url,
    DROP COLUMN IF EXISTS payment_proof_at;
