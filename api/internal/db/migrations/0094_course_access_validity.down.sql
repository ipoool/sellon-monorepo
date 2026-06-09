ALTER TABLE products DROP CONSTRAINT IF EXISTS products_access_validity_unit_check;
ALTER TABLE products
    DROP COLUMN IF EXISTS access_validity_value,
    DROP COLUMN IF EXISTS access_validity_unit;
