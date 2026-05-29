-- Base recipe: materials a product consumes per unit sold, regardless of any
-- modifier options (e.g. pie crust for a cheese pie, beans+water for coffee).
-- quantity is in the material's base_unit (integer). Per-option recipes
-- (option_recipe_items) come in a later migration once modifier options exist.
CREATE TABLE IF NOT EXISTS product_recipe_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    quantity    BIGINT NOT NULL CHECK (quantity > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, material_id)
);
CREATE INDEX IF NOT EXISTS product_recipe_items_product_idx ON product_recipe_items (product_id);
