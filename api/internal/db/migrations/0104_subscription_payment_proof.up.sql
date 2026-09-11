-- Payment proof for manual-transfer subscription invoices.
--
-- Upgrades are paid by bank transfer and verified by hand. Until now the
-- only channel for the receipt was a WhatsApp message to support, so the
-- proof lived outside the system entirely: the admin verifying an invoice
-- in /platform/subscriptions had nothing to check it against, and a seller
-- who transferred but never messaged looked identical to one who had not
-- paid at all.
--
-- Empty string (not NULL) for the URL matches orders.payment_proof_url so
-- the two proof paths read the same way in queries.
ALTER TABLE subscription_invoices
    ADD COLUMN IF NOT EXISTS payment_proof_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS payment_proof_at  TIMESTAMPTZ;
