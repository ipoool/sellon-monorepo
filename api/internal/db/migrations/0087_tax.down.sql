ALTER TABLE orders
    DROP COLUMN IF EXISTS tax_cents,
    DROP COLUMN IF EXISTS tax_bps,
    DROP COLUMN IF EXISTS tax_inclusive;

ALTER TABLE stores
    DROP COLUMN IF EXISTS tax_enabled,
    DROP COLUMN IF EXISTS tax_bps,
    DROP COLUMN IF EXISTS tax_inclusive,
    DROP COLUMN IF EXISTS tax_label;
