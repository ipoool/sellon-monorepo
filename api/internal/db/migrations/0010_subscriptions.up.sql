-- Per-store subscription. One row per store; default created lazily on
-- first GET (plan='free', status='active', no period end).
--
-- plan:    'free' | 'pro'
-- status:  'active' | 'cancelled' | 'expired'
--   - active: plan currently in effect; for 'pro' this is paid through
--     current_period_end.
--   - cancelled: user clicked Batalkan; access stays until current_period_end
--     then transitions to 'expired'/'free'.
--   - expired: pro period ended without renewal; effective plan is 'free'.
CREATE TABLE IF NOT EXISTS subscriptions (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id              UUID         NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
    plan                  TEXT         NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    status                TEXT         NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    cancelled_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Invoice history. For MVP these are recorded manually by ops when a
-- seller pays via WhatsApp/transfer; later this can be auto-created by a
-- payment-gateway webhook.
CREATE TABLE IF NOT EXISTS subscription_invoices (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    subscription_id UUID         NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount_cents    BIGINT       NOT NULL DEFAULT 0,
    status          TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    notes           TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_invoices_store_idx
    ON subscription_invoices (store_id, created_at DESC);
