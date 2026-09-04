-- Auth hardening.
--
-- 1. A password submitted at /auth/register for an EXISTING row (legacy
--    Google-only account, or an unverified earlier registration) is no longer
--    written to users.password_hash straight away — that let anyone take over
--    any pre-migration account with just its email. The bcrypt hash (+ name)
--    is parked on the verification row and only applied once the email owner
--    proves possession by entering the code.
-- 2. The same table now serves password resets (purpose = 'reset').
-- 3. users.sessions_valid_after lets a password reset revoke every JWT issued
--    before it (RequireAuth compares it to the token's iat).
ALTER TABLE email_verifications
    ADD COLUMN IF NOT EXISTS purpose               TEXT NOT NULL DEFAULT 'verify',
    ADD COLUMN IF NOT EXISTS pending_password_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS pending_name          TEXT NOT NULL DEFAULT '';

ALTER TABLE email_verifications
    DROP CONSTRAINT IF EXISTS email_verifications_purpose_check;
ALTER TABLE email_verifications
    ADD CONSTRAINT email_verifications_purpose_check CHECK (purpose IN ('verify', 'reset'));

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS sessions_valid_after TIMESTAMPTZ;
