-- Switch primary auth from Google SSO to email+password. google_id becomes
-- optional (existing Google-only accounts keep it and can "claim" a
-- password later via the register endpoint, which upgrades their row
-- instead of erroring on a duplicate email). email is now the login
-- identity so it must be unique.
ALTER TABLE users
    ALTER COLUMN google_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS password_hash     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ;

-- Legacy Google logins already proved ownership of their email — treat
-- them as verified so they don't get an unnecessary OTP prompt.
UPDATE users SET email_verified_at = created_at
    WHERE google_id IS NOT NULL AND email_verified_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email));

-- One row per user; a fresh register/resend overwrites in place (like
-- buyer_otps). Six-digit code, hashed, short TTL, rate-limited resend.
CREATE TABLE IF NOT EXISTS email_verifications (
    user_id       UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash     TEXT        NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    attempt_count INT         NOT NULL DEFAULT 0,
    resend_count  INT         NOT NULL DEFAULT 0,
    last_sent_at  TIMESTAMPTZ,
    consumed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
