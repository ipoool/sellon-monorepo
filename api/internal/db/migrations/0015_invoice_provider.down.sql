DROP INDEX IF EXISTS subscription_invoices_provider_order_idx;
ALTER TABLE subscription_invoices
    DROP COLUMN IF EXISTS plan,
    DROP COLUMN IF EXISTS months,
    DROP COLUMN IF EXISTS provider_order_id,
    DROP COLUMN IF EXISTS provider;
