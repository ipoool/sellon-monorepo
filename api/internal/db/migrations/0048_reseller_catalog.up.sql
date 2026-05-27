-- Reseller's imported catalog: which program products a reseller has chosen
-- to sell in their own storefront, and at what price (must be >= modal).
CREATE TABLE IF NOT EXISTS reseller_catalog (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id        UUID        NOT NULL REFERENCES reseller_memberships(id) ON DELETE CASCADE,
    program_product_id   UUID        NOT NULL REFERENCES reseller_program_products(id) ON DELETE CASCADE,
    reseller_price_cents BIGINT      NOT NULL CHECK (reseller_price_cents >= 0),
    is_active            BOOLEAN     NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (membership_id, program_product_id)
);
CREATE INDEX IF NOT EXISTS reseller_catalog_membership_idx ON reseller_catalog (membership_id);
