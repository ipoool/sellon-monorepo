-- Reseller/dropship: supplier stores create programs that resellers can join.
-- A program has an invite code, description, and links to products with
-- reseller-specific pricing (cost price for the reseller/modal).
CREATE TABLE IF NOT EXISTS reseller_programs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_store_id UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    description       TEXT        NOT NULL DEFAULT '',
    invite_code       TEXT        NOT NULL UNIQUE,
    is_active         BOOLEAN     NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reseller_programs_supplier_idx ON reseller_programs (supplier_store_id);
CREATE INDEX IF NOT EXISTS reseller_programs_code_idx    ON reseller_programs (invite_code);
