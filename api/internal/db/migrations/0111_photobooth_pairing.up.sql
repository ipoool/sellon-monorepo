-- PhotoBoost: pair a tablet to a booth with a short code instead of a token.
--
-- The device credential is 64 hex characters. Typing that on a tablet at a
-- mall kiosk — correctly, once — is the kind of task that gets solved by
-- pasting the token into a note-taking app, which is exactly where a
-- long-lived credential should never end up.
--
-- So the operator reads a six-character code off the admin console and types
-- it into the booth; the booth exchanges it for the real token over TLS and
-- stores it itself. The code is short-lived, single-use, and worthless after
-- redemption, so the fragile part of the handoff is no longer the secret.
CREATE TABLE IF NOT EXISTS photobooth_pairing_codes (
    id       UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    booth_id UUID NOT NULL REFERENCES photobooth_booths(id) ON DELETE CASCADE,

    -- Six characters from an alphabet with no 0/O/1/I/L: the code is read off
    -- a screen and typed on a tablet by someone standing in a mall, and the
    -- ambiguous pairs are where that goes wrong.
    code       TEXT NOT NULL CHECK (code ~ '^[A-HJ-KMNP-Z2-9]{6}$'),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Set by redemption, which is a guarded UPDATE: the row stops being
    -- redeemable in the same statement that hands out the token, so two
    -- tablets racing on one code cannot both pair.
    redeemed_at       TIMESTAMPTZ,
    redeemed_token_id UUID REFERENCES photobooth_device_tokens(id) ON DELETE SET NULL,
    device_label      TEXT NOT NULL DEFAULT '',

    created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Redemption looks a code up with no booth context, so an unredeemed code has
-- to be unambiguous. Redeemed rows drop out of the index and are kept as the
-- pairing history for that booth.
CREATE UNIQUE INDEX IF NOT EXISTS photobooth_pairing_codes_live_uniq
    ON photobooth_pairing_codes (code)
    WHERE redeemed_at IS NULL;

CREATE INDEX IF NOT EXISTS photobooth_pairing_codes_booth_idx
    ON photobooth_pairing_codes (booth_id, created_at DESC);
