-- PhotoBoost: booth registry, platform defaults, and device credentials.
--
-- PhotoBoost is a PLATFORM business, not a seller feature: it charges through
-- the platform's own Midtrans account and its transactions live in the admin
-- area. Nothing here references stores(id) for that reason.

-- Platform-wide defaults. Single row, enforced by the boolean-PK trick so a
-- second row is impossible rather than merely discouraged.
CREATE TABLE IF NOT EXISTS photobooth_settings (
    id                              BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
    default_price_cents             BIGINT      NOT NULL DEFAULT 2500000
        CHECK (default_price_cents >= 0),
    default_shots_count             INT         NOT NULL DEFAULT 4
        CHECK (default_shots_count BETWEEN 1 AND 12),
    default_print_copies            INT         NOT NULL DEFAULT 1
        CHECK (default_print_copies BETWEEN 1 AND 5),
    default_session_timeout_seconds INT         NOT NULL DEFAULT 300
        CHECK (default_session_timeout_seconds BETWEEN 30 AND 3600),
    default_qris_expiry_minutes     INT         NOT NULL DEFAULT 10
        CHECK (default_qris_expiry_minutes BETWEEN 1 AND 120),
    -- [{id, name, image_url, kind}] — uploaded by an admin, cached by booths.
    default_frames                  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    updated_by                      UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rp 25.000 for 4 shots is the starting point; an admin edits it at runtime.
INSERT INTO photobooth_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS photobooth_booths (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Short human code; it becomes part of the Midtrans order_id, so keep it
    -- to characters that survive a URL and a receipt.
    code     TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,8}$'),
    name     TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    status   TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'retired')),

    -- Per-booth overrides. NULL means "inherit the platform default", so an
    -- admin editing the global price changes every booth that never set its
    -- own — no backfill, and no silent drift between the two.
    price_cents             BIGINT CHECK (price_cents IS NULL OR price_cents >= 0),
    shots_count             INT    CHECK (shots_count IS NULL OR shots_count BETWEEN 1 AND 12),
    print_copies            INT    CHECK (print_copies IS NULL OR print_copies BETWEEN 1 AND 5),
    session_timeout_seconds INT    CHECK (session_timeout_seconds IS NULL
                                          OR session_timeout_seconds BETWEEN 30 AND 3600),
    qris_expiry_minutes     INT    CHECK (qris_expiry_minutes IS NULL
                                          OR qris_expiry_minutes BETWEEN 1 AND 120),
    frames                  JSONB,

    notes TEXT NOT NULL DEFAULT '',

    -- Fleet health, written by the booth's heartbeat. An unattended fleet with
    -- no liveness signal means "the Bandung booth has been down three days"
    -- is discovered by a tenant complaint.
    last_seen_at TIMESTAMPTZ,
    app_version  TEXT    NOT NULL DEFAULT '',
    printer_ok   BOOLEAN NOT NULL DEFAULT true,
    paper_low    BOOLEAN NOT NULL DEFAULT false,

    created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photobooth_booths_status_idx
    ON photobooth_booths (status, created_at DESC);

CREATE TABLE IF NOT EXISTS photobooth_device_tokens (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booth_id UUID NOT NULL REFERENCES photobooth_booths(id) ON DELETE CASCADE,
    -- sha256 hex of the raw token. The raw value is returned exactly once, at
    -- issue time, and is never recoverable afterwards — same posture the repo
    -- takes with sellers' encrypted Midtrans keys.
    token_hash   TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    label        TEXT NOT NULL DEFAULT '',

    created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    revoked_by   UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS photobooth_device_tokens_hash_uniq
    ON photobooth_device_tokens (token_hash);

-- A booth may hold several live tokens at once; that overlap is what makes
-- rotation safe (issue new -> provision the tablet -> revoke old).
CREATE INDEX IF NOT EXISTS photobooth_device_tokens_active_idx
    ON photobooth_device_tokens (booth_id)
    WHERE revoked_at IS NULL;
