-- Raw materials & packaging inventory (store-level). Tracks ingredients
-- (cheese, sugar) and packaging (cups per size, take-away plastic) consumed
-- per sale. Stock may go negative on purpose (soft tracking — never blocks a
-- sale); negative is a "recount me" signal. cost_cents is the modal per 1
-- base_unit. All quantities are integers in the base_unit (gram/ml/pcs).
CREATE TABLE IF NOT EXISTS materials (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    kind                TEXT NOT NULL DEFAULT 'ingredient' CHECK (kind IN ('ingredient', 'packaging')),
    base_unit           TEXT NOT NULL,
    cost_cents          BIGINT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    stock               BIGINT NOT NULL DEFAULT 0,
    low_stock_threshold BIGINT NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_store_idx ON materials (store_id) WHERE is_active;
