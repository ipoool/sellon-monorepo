-- Revert the column default only. The data backfill is intentionally NOT
-- reverted: prior per-store enabled state wasn't snapshotted, and blanket-
-- setting tax_enabled = false would wrongly disable stores that legitimately
-- turned tax on after this migration ran.
ALTER TABLE stores ALTER COLUMN tax_enabled SET DEFAULT false;
