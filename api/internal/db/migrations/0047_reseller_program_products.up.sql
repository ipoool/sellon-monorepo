-- Products made available inside a reseller program, with the cost price
-- (harga modal) that resellers pay to the supplier. Resellers cannot set
-- their sell price below this value.
CREATE TABLE IF NOT EXISTS reseller_program_products (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id           UUID        NOT NULL REFERENCES reseller_programs(id) ON DELETE CASCADE,
    product_id           UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    reseller_price_cents BIGINT      NOT NULL CHECK (reseller_price_cents >= 0),
    is_active            BOOLEAN     NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (program_id, product_id)
);
CREATE INDEX IF NOT EXISTS reseller_program_products_program_idx ON reseller_program_products (program_id);
