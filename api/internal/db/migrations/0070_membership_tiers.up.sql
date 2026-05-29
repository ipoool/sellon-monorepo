CREATE TABLE membership_tiers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    min_spent_cents  BIGINT NOT NULL DEFAULT 0 CHECK (min_spent_cents >= 0),
    point_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (point_multiplier >= 0),
    discount_percent INT NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    sort_order       INT NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_membership_tiers_store ON membership_tiers (store_id, min_spent_cents) WHERE is_active;
