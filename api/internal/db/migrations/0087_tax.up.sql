-- Per-store tax/PPN config + per-order tax snapshot.
-- Rate stored in basis points (tax_bps): 1100 = 11.00%. Integer math, no floats.
-- tax_inclusive=false → tax added on top (customer-borne). true → already inside
-- the price (informational only; total unchanged). Tax base = subtotal − discount.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS tax_enabled   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tax_bps       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tax_label     TEXT    NOT NULL DEFAULT 'PPN';

-- Snapshot on each order so historical orders keep their tax even if the
-- seller later changes the rate.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS tax_cents     BIGINT  NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_bps       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT false;
