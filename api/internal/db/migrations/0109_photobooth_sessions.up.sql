-- PhotoBoost: the session row. This IS the transaction the admin "Transaksi"
-- tab renders, so it carries both the money fields and enough of the funnel
-- to diagnose an unattended booth without digging through logs.

CREATE TABLE IF NOT EXISTS photobooth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- RESTRICT, not CASCADE: a money row must never disappear because someone
    -- deleted a booth. Retire the booth (status='retired') instead.
    booth_id        UUID NOT NULL REFERENCES photobooth_booths(id) ON DELETE RESTRICT,
    device_token_id UUID REFERENCES photobooth_device_tokens(id) ON DELETE SET NULL,

    -- 'PB-{CODE}-{YYMMDD}-{6 random}'. Doubles as the Midtrans order_id and as
    -- the code shown to a customer whose print failed.
    session_number  TEXT NOT NULL UNIQUE,
    idempotency_key TEXT,

    -- Snapshotted from the effective config at create time. Never accepted
    -- from the client: the tablet is a physically accessible device.
    amount_cents  BIGINT NOT NULL CHECK (amount_cents >= 0),
    shots_planned INT    NOT NULL CHECK (shots_planned BETWEEN 1 AND 12),
    shots_taken   INT    NOT NULL DEFAULT 0 CHECK (shots_taken >= 0),
    print_copies  INT    NOT NULL DEFAULT 1 CHECK (print_copies BETWEEN 1 AND 5),
    frame_id      TEXT   NOT NULL DEFAULT '',

    -- Funnel. A row stuck at 'paid' with shots_taken = 0 is a booth that took
    -- money and then lost its camera — the most expensive failure mode here,
    -- and the reason the status ladder is this granular.
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'awaiting_payment', 'paid', 'capturing',
                          'printing', 'completed', 'expired', 'failed', 'refunded')),
    payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),

    payment_provider        TEXT NOT NULL DEFAULT 'midtrans',
    payment_method          TEXT NOT NULL DEFAULT 'qris',
    provider_order_id       TEXT,
    provider_transaction_id TEXT NOT NULL DEFAULT '',
    -- Both are stored: the app renders the QR locally from qr_string so a
    -- flaky link to Midtrans's CDN cannot blank the screen, and falls back to
    -- qr_url when the acquirer did not return a payload.
    qr_string     TEXT NOT NULL DEFAULT '',
    qr_url        TEXT NOT NULL DEFAULT '',
    qr_expires_at TIMESTAMPTZ,
    -- Claimed before the gateway call, released if Midtrans rejects. Mirrors
    -- orders.refund_pending (migration 0098).
    charge_pending BOOLEAN NOT NULL DEFAULT false,

    needs_review  BOOLEAN NOT NULL DEFAULT false,
    review_reason TEXT    NOT NULL DEFAULT '',

    refunded_at         TIMESTAMPTZ,
    refund_amount_cents BIGINT,
    refund_reason       TEXT NOT NULL DEFAULT '',

    result_url     TEXT NOT NULL DEFAULT '',
    app_version    TEXT NOT NULL DEFAULT '',
    failure_reason TEXT NOT NULL DEFAULT '',

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    charged_at    TIMESTAMPTZ,
    paid_at       TIMESTAMPTZ,
    captured_at   TIMESTAMPTZ,
    printed_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    expired_at    TIMESTAMPTZ,
    -- Throttles the lazy reconcile: how recently we last asked Midtrans for
    -- this transaction's real status.
    reconciled_at TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same shape as orders_store_idempotency_key_uniq (migration 0090): a booth
-- retrying through a flaky link converges on one session instead of minting
-- a second charge.
CREATE UNIQUE INDEX IF NOT EXISTS photobooth_sessions_idem_uniq
    ON photobooth_sessions (booth_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Webhook lookup must be unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS photobooth_sessions_provider_order_uniq
    ON photobooth_sessions (provider_order_id)
    WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS photobooth_sessions_booth_created_idx
    ON photobooth_sessions (booth_id, created_at DESC);
CREATE INDEX IF NOT EXISTS photobooth_sessions_created_idx
    ON photobooth_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS photobooth_sessions_payment_idx
    ON photobooth_sessions (payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS photobooth_sessions_review_idx
    ON photobooth_sessions (created_at DESC)
    WHERE needs_review;
