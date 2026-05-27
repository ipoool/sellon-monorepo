-- Tracks which reseller stores have joined which programs.
-- Join is instant (no supplier approval in MVP).
CREATE TABLE IF NOT EXISTS reseller_memberships (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id        UUID        NOT NULL REFERENCES reseller_programs(id) ON DELETE CASCADE,
    reseller_store_id UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    is_active         BOOLEAN     NOT NULL DEFAULT true,
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (program_id, reseller_store_id)
);
CREATE INDEX IF NOT EXISTS reseller_memberships_reseller_idx ON reseller_memberships (reseller_store_id);
CREATE INDEX IF NOT EXISTS reseller_memberships_program_idx  ON reseller_memberships (program_id);
