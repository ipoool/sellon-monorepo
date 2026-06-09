-- Data backfill only — no schema change to reverse, and we can't distinguish
-- backfilled emails from naturally-captured ones, so the down is a no-op.
SELECT 1;
