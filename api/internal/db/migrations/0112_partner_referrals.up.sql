-- Partner referrals and revenue share.
--
-- SellOn promotes through partners (events, communities, resellers of
-- attention) on a revenue-share deal. The deal needs one question answered
-- reliably: which users came from which partner, and which of them paid.
--
-- Three lifetimes, three tables. Who the partner is, which users belong to
-- them, and what they earned change at different rates; collapsing them
-- would mean raising a partner's rate silently restates what they are owed.

CREATE TABLE IF NOT EXISTS partners (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Appears in a URL and gets read aloud at an event, so: uppercase,
    -- URL-safe, no ambiguity, short enough to print on a banner.
    code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,23}$'),
    name TEXT NOT NULL,

    contact_name  TEXT NOT NULL DEFAULT '',
    -- Where conversion notifications go. Empty = notifications disabled.
    contact_email TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',

    -- Basis points, so 17.5% is expressible and no float ever touches money.
    commission_bps INT NOT NULL DEFAULT 2000
        CHECK (commission_bps BETWEEN 0 AND 10000),

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'ended')),
    notes  TEXT NOT NULL DEFAULT '',

    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive: the code arrives from a URL typed by a human.
CREATE UNIQUE INDEX IF NOT EXISTS partners_code_uniq ON partners (UPPER(code));

-- Payout batches. Declared before commissions for the FK.
--
-- A payout is a real event with a date, a method and a total, not a note
-- scribbled on each commission row: months later "did you pay me for March"
-- has to be answerable from the database.
CREATE TABLE IF NOT EXISTS partner_payouts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,

    amount_cents     BIGINT NOT NULL CHECK (amount_cents >= 0),
    commission_count INT    NOT NULL DEFAULT 0,
    method    TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    notes     TEXT NOT NULL DEFAULT '',

    paid_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_payouts_partner_idx
    ON partner_payouts (partner_id, paid_at DESC);

-- The bond: one partner per user, decided at signup, never revised.
CREATE TABLE IF NOT EXISTS partner_referrals (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT: a partner with history is deactivated, never deleted.
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    code_used     TEXT NOT NULL DEFAULT '',
    signup_method TEXT NOT NULL DEFAULT 'email'
        CHECK (signup_method IN ('google', 'email', 'admin')),
    -- Which page the visitor landed on, for the operator's own read on what
    -- actually worked. Never part of money arithmetic.
    landing_path  TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- First-touch wins, structurally. A second partner's code for a user who
-- already has a bond is absorbed here, not by a branch someone has to
-- remember to write.
CREATE UNIQUE INDEX IF NOT EXISTS partner_referrals_user_uniq
    ON partner_referrals (user_id);

CREATE INDEX IF NOT EXISTS partner_referrals_partner_idx
    ON partner_referrals (partner_id, created_at DESC);

-- The ledger.
CREATE TABLE IF NOT EXISTS partner_commissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id  UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    referral_id UUID REFERENCES partner_referrals(id) ON DELETE SET NULL,

    -- Nullable, with an email snapshot beside it: an admin can hard-delete a
    -- user, and a commission that was already paid out is accounting that has
    -- to stay readable after the account is gone. NULLs are distinct in a
    -- unique index, so a deleted user never blocks a future row either.
    referred_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    referred_user_email TEXT NOT NULL DEFAULT '',
    store_id            UUID REFERENCES stores(id) ON DELETE SET NULL,
    store_name          TEXT NOT NULL DEFAULT '',

    invoice_id UUID NOT NULL REFERENCES subscription_invoices(id) ON DELETE RESTRICT,
    plan       TEXT NOT NULL DEFAULT '',
    months     INT  NOT NULL DEFAULT 1,

    base_amount_cents BIGINT NOT NULL CHECK (base_amount_cents >= 0),
    -- Snapshotted, the way subscriptions snapshot plan limits: raising a
    -- partner's rate next quarter must not restate what they already earned.
    commission_bps    INT    NOT NULL,
    commission_cents  BIGINT NOT NULL CHECK (commission_cents >= 0),

    status TEXT NOT NULL DEFAULT 'earned'
        CHECK (status IN ('earned', 'paid', 'void')),
    payout_id   UUID REFERENCES partner_payouts(id) ON DELETE SET NULL,
    void_reason TEXT NOT NULL DEFAULT '',

    -- Claimed before the notification email is sent, so a redelivered webhook
    -- cannot tell a partner twice that they earned the same commission.
    notified_at TIMESTAMPTZ,
    paid_out_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THE business rule, as an index rather than an if-statement: at most ONE
-- live commission per referred user, forever. A renewal twelve months later
-- finds this occupied and inserts nothing.
--
-- Partial on purpose: voiding a refunded commission frees the slot, so the
-- customer's next genuine payment can earn again.
CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_user_once
    ON partner_commissions (referred_user_id)
    WHERE status <> 'void';

-- Replay guard: one invoice can never mint two commissions, voided ones
-- included. Accrual uses a bare ON CONFLICT DO NOTHING so that either this
-- index or the one above can absorb a duplicate -- a conflict target can
-- only name one of them.
CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_invoice_uniq
    ON partner_commissions (invoice_id);

CREATE INDEX IF NOT EXISTS partner_commissions_partner_idx
    ON partner_commissions (partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_commissions_payout_idx
    ON partner_commissions (payout_id);
