-- Add-ons: Bisnis features sold individually on top of Pro.
--
-- The complaint this answers is "sayang berlangganan Bisnis kalau cuma
-- beberapa fitur yang dipakai". Bisnis does not go away — it becomes the
-- bundle price for taking everything, so a seller who wants the whole set
-- still has an obviously cheaper door than buying three add-ons.

-- What can be sold. Price lives here so an admin can change it from the
-- dashboard without a deploy, the same contract the `plans` table has.
--
-- Which FEATURES an add-on contains is deliberately NOT here: that is in
-- api/internal/domain/feature/feature.go. Package composition is a product
-- decision, and a price column an admin edits beside a feature list they
-- can also edit is exactly how the two drift apart.
CREATE TABLE IF NOT EXISTS addons (
    code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,30}$'),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',

    -- Mirrors plans: yearly_price_cents is the PER-MONTH figure when billed
    -- twelve months at once, so the discount maths is identical.
    monthly_price_cents BIGINT NOT NULL DEFAULT 0
        CHECK (monthly_price_cents >= 0),
    yearly_price_cents  BIGINT NOT NULL DEFAULT 0
        CHECK (yearly_price_cents >= 0),

    is_active  BOOLEAN NOT NULL DEFAULT true,
    sort_order INT     NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO addons (code, name, description, monthly_price_cents, yearly_price_cents, sort_order) VALUES
    ('kasir', 'Paket Kasir',
     'Kasir POS, struk printer, QR meja, dan layar dapur.',
     9900000, 7900000, 0),
    ('ai', 'Analisa AI',
     'Ringkasan penjualan dan saran stok dari AI.',
     7900000, 6300000, 1),
    ('membership', 'Membership & Loyalty',
     'Kartu member, poin, dan tier pelanggan.',
     5900000, 4700000, 2)
ON CONFLICT (code) DO NOTHING;

-- What a store actually has.
--
-- Rows are NEVER deleted, only soft-cancelled. The free tail below is
-- granted once per store per add-on, and "once" is only enforceable if the
-- history survives a cancellation.
CREATE TABLE IF NOT EXISTS store_addons (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    -- RESTRICT: an add-on that stores have bought is history, not a row to
    -- delete. Retire it with is_active = false.
    addon_code TEXT NOT NULL REFERENCES addons(code) ON DELETE RESTRICT,

    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The free tail. Set at activation to the subscription's period end:
    -- the add-on works immediately and is first charged on the next
    -- renewal, so nobody is billed for a part-month they cannot verify.
    -- NULL means it was activated without one (a re-activation).
    free_until TIMESTAMPTZ,

    -- The first invoice that charged it. NULL = still inside the free tail.
    first_billed_at TIMESTAMPTZ,

    cancelled_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live row per store per add-on. Buying something you already have is
-- refused by the database rather than by a check someone has to remember.
CREATE UNIQUE INDEX IF NOT EXISTS store_addons_live_uniq
    ON store_addons (store_id, addon_code)
    WHERE cancelled_at IS NULL;

-- Reads: "what does this store have right now" on every gated request, and
-- "has this store ever had this add-on" when granting the free tail.
CREATE INDEX IF NOT EXISTS store_addons_store_idx
    ON store_addons (store_id)
    WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS store_addons_history_idx
    ON store_addons (store_id, addon_code);

-- Invoice line items.
--
-- An invoice used to be one plan and one number. With add-ons the total is
-- a sum a seller has to be able to check, and "Rp 237.000" with no
-- breakdown is the kind of bill people dispute.
CREATE TABLE IF NOT EXISTS subscription_invoice_lines (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES subscription_invoices(id) ON DELETE CASCADE,

    kind TEXT NOT NULL CHECK (kind IN ('plan', 'addon')),
    -- Plan tier or addon code. Not an FK: this is a snapshot of what was
    -- sold, and it must stay readable after the add-on is retired.
    code        TEXT NOT NULL,
    description TEXT NOT NULL,

    months           INT    NOT NULL DEFAULT 1 CHECK (months >= 1),
    unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
    amount_cents     BIGINT NOT NULL CHECK (amount_cents >= 0),

    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_invoice_lines_invoice_idx
    ON subscription_invoice_lines (invoice_id, sort_order);
