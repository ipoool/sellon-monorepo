-- Tax is now ON by default for every store. New stores inherit the column
-- default; existing stores are backfilled. Note: this only flips the master
-- switch — tax_bps stays 0, so no tax is actually charged until a seller sets
-- a rate (ComputeTaxCents returns 0 when bps = 0). The effect is purely that
-- the tax setting is active/expanded by default, nudging sellers to configure
-- their PPN rate.
ALTER TABLE stores ALTER COLUMN tax_enabled SET DEFAULT true;

UPDATE stores SET tax_enabled = true WHERE NOT tax_enabled;
