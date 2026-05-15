-- Track Midtrans/whoever's order_id on each subscription invoice so the
-- platform-billing webhook can map back to our row when payment settles.
-- months is stored at checkout time so the webhook knows how long to
-- extend the period without recomputing.
ALTER TABLE subscription_invoices
    ADD COLUMN IF NOT EXISTS provider          TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS provider_order_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS months            INT  NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS plan              TEXT NOT NULL DEFAULT 'pro';

-- Lookup index for the webhook handler.
CREATE INDEX IF NOT EXISTS subscription_invoices_provider_order_idx
    ON subscription_invoices (provider_order_id) WHERE provider_order_id <> '';
