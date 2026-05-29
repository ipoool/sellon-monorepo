ALTER TABLE order_items DROP COLUMN serving_type;

ALTER TABLE products
  DROP COLUMN takeaway_enabled,
  DROP COLUMN takeaway_charge_cents,
  DROP COLUMN takeaway_material_id;
