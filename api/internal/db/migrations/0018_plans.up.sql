-- Subscription plan prices, source-of-truth in Postgres so admin can
-- update via /admin/plans without a deploy. The "tier" column is also
-- the FK target for subscriptions.plan (kept loose with a CHECK rather
-- than FK to avoid surprise cascade behavior on tier rename).
--
-- Two prices per tier so the landing page can advertise a yearly
-- discount: yearly_price_cents is the per-month figure when paying
-- annually (e.g. 7_900_000 = Rp 79rb/bulan, ditagih tahunan).
CREATE TABLE IF NOT EXISTS plans (
    tier                TEXT        PRIMARY KEY
        CHECK (tier IN ('free', 'pro', 'bisnis')),
    name                TEXT        NOT NULL,
    monthly_price_cents BIGINT      NOT NULL DEFAULT 0,
    yearly_price_cents  BIGINT      NOT NULL DEFAULT 0,
    currency            TEXT        NOT NULL DEFAULT 'IDR',
    sort_order          INT         NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the values the codebase shipped with on 2026-05-10.
-- Existing landing-page literals: Rp 0 / Rp 99rb / Rp 79rb yearly /
-- Rp 299rb / Rp 239rb yearly. ON CONFLICT DO NOTHING so re-runs after
-- admin edits don't clobber the live values.
INSERT INTO plans (tier, name, monthly_price_cents, yearly_price_cents, sort_order) VALUES
    ('free',   'Gratis',     0,            0,           0),
    ('pro',    'Pro',        99_000_00,    79_000_00,   1),
    ('bisnis', 'Bisnis',     299_000_00,   239_000_00,  2)
ON CONFLICT (tier) DO NOTHING;
