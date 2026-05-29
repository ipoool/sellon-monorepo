-- Modifier option groups per product (size, packaging, with/without cheese,
-- heated/not). selection = how many options can be picked. is_required forces
-- the buyer to choose (typically size). Sort for display order.
CREATE TABLE IF NOT EXISTS product_modifier_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    selection   TEXT NOT NULL DEFAULT 'single' CHECK (selection IN ('single', 'multi')),
    is_required BOOLEAN NOT NULL DEFAULT false,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_modifier_groups_product_idx ON product_modifier_groups (product_id);
