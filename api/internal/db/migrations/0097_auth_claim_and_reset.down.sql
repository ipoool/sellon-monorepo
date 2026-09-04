ALTER TABLE users DROP COLUMN IF EXISTS sessions_valid_after;

ALTER TABLE email_verifications
    DROP CONSTRAINT IF EXISTS email_verifications_purpose_check;
ALTER TABLE email_verifications
    DROP COLUMN IF EXISTS pending_name,
    DROP COLUMN IF EXISTS pending_password_hash,
    DROP COLUMN IF EXISTS purpose;
