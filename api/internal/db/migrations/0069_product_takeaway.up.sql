ALTER TABLE products
  ADD COLUMN takeaway_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN takeaway_charge_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN takeaway_material_id UUID REFERENCES materials(id) ON DELETE SET NULL;

ALTER TABLE order_items ADD COLUMN serving_type TEXT NOT NULL DEFAULT '';
