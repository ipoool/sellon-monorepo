-- Per-option recipe: extra materials consumed when a modifier option is
-- chosen (size "Large" → 1 large cup; "Dengan Keju" → 50g cheese; "Take-away"
-- → 1 plastic). Options without a row here (e.g. heated/not) consume nothing.
-- quantity is in the material's base_unit (integer).
CREATE TABLE IF NOT EXISTS option_recipe_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    option_id   UUID NOT NULL REFERENCES product_modifier_options(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    quantity    BIGINT NOT NULL CHECK (quantity > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (option_id, material_id)
);
CREATE INDEX IF NOT EXISTS option_recipe_items_option_idx ON option_recipe_items (option_id);
