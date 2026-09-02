DROP TABLE IF EXISTS email_verifications;
DROP INDEX IF EXISTS users_email_unique_idx;
ALTER TABLE users
    DROP COLUMN IF EXISTS email_verified_at,
    DROP COLUMN IF EXISTS password_hash,
    ALTER COLUMN google_id SET NOT NULL;
