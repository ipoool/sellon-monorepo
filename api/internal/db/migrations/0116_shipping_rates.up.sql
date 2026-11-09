-- Seller-defined shipping rates ("ongkir custom"), per area.
--
-- The built-in courier table and RajaOngkir both answer "what would JNE
-- charge". Neither can answer "I deliver within Bandung myself for
-- Rp 10.000, and customers may collect in person for nothing" — which is
-- how a large share of UMKM actually ship. These rows are that answer.
--
-- A store with at least one ACTIVE rate stops quoting automatic couriers
-- altogether (see handler ShippingQuote): a seller who delivers by
-- motorbike does not want JNE listed beside it.
CREATE TABLE IF NOT EXISTS shipping_rates (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    name        TEXT   NOT NULL CHECK (name <> '' AND length(name) <= 60),
    price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
    -- Free text, shown as-is to the buyer ("1 hari", "hari ini", "").
    eta         TEXT   NOT NULL DEFAULT '' CHECK (length(eta) <= 40),

    -- Normalised, lower-cased city names this rate serves. The handler
    -- normalises the buyer's city the same way before matching, so
    -- "Kab. Bandung" and "bandung" are the same area.
    areas TEXT[] NOT NULL DEFAULT '{}',

    -- A fallback serves every city NO other active rate claims. That is a
    -- different thing from an empty `areas` list, which means "available
    -- everywhere" — how in-store pickup is expressed. Keeping both lets a
    -- seller write "Dalam kota 10rb / luar area 35rb / ambil sendiri 0"
    -- without any of the three shadowing the others.
    is_fallback BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT shipping_rates_fallback_has_no_areas
        CHECK (NOT is_fallback OR cardinality(areas) = 0),

    is_active  BOOLEAN     NOT NULL DEFAULT true,
    sort_order INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipping_rates_store_idx
    ON shipping_rates (store_id, sort_order, created_at);

-- Two live fallbacks would make "everything else" ambiguous, and the buyer
-- would see whichever row the planner happened to return first. Settled by
-- the database rather than by a check in Go that a second code path can
-- forget.
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rates_one_fallback
    ON shipping_rates (store_id)
    WHERE is_active AND is_fallback;
