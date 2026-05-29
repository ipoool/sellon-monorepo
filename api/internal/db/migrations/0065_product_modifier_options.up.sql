-- Options within a modifier group. price_delta_cents adds to the sale price
-- when selected (e.g. Large +Rp3.000, Dengan Keju +Rp5.000; 0 for no change).
CREATE TABLE IF NOT EXISTS product_modifier_options (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          UUID NOT NULL REFERENCES product_modifier_groups(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    price_delta_cents BIGINT NOT NULL DEFAULT 0,
    sort_order        INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_modifier_options_group_idx ON product_modifier_options (group_id);
