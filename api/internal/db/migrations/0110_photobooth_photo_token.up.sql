-- PhotoBoost: let a customer take the soft copy home by scanning a QR.
--
-- The QR points at a token, not at the session number. The number is short,
-- readable aloud, and printed on the strip — fine for an operator reprint,
-- wrong as the only thing standing between a stranger and a photograph of
-- someone's face. This is 32 random bytes with its own lifetime.
ALTER TABLE photobooth_sessions
    ADD COLUMN IF NOT EXISTS photo_token      TEXT,
    -- Photos of people do not live forever. The booth sets this at upload;
    -- past it the public endpoint answers 410 and the object can be swept.
    ADD COLUMN IF NOT EXISTS photo_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS photobooth_sessions_photo_token_uniq
    ON photobooth_sessions (photo_token)
    WHERE photo_token IS NOT NULL;
