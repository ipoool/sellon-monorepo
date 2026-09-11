DROP INDEX IF EXISTS users_marketing_opt_in_idx;
ALTER TABLE users DROP COLUMN IF EXISTS marketing_opt_in_at;
