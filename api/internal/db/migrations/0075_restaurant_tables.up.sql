CREATE TABLE restaurant_tables (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    area       TEXT NOT NULL DEFAULT '',
    qr_token   TEXT NOT NULL UNIQUE,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, label)
);
CREATE INDEX idx_restaurant_tables_store ON restaurant_tables (store_id) WHERE is_active;

ALTER TABLE stores
    ADD COLUMN dinein_enabled      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN dinein_payment_mode TEXT NOT NULL DEFAULT 'cashier'
        CHECK (dinein_payment_mode IN ('cashier','online')),
    ADD COLUMN kds_enabled         BOOLEAN NOT NULL DEFAULT false;
