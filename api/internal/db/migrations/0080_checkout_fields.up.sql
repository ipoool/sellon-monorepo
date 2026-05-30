-- Seller-configurable checkout fields. checkout_config holds the email mode
-- ("optional"|"required"|"hidden") for the built-in email field plus a list of
-- custom fields the buyer fills at checkout. orders.custom_fields stores the
-- submitted values as a snapshot array [{key,label,value}] so the seller's
-- order view stays correct even if the config later changes.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS checkout_config JSONB NOT NULL
        DEFAULT '{"email_mode":"optional","fields":[]}'::jsonb;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;
