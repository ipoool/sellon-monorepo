-- Promos / Kupon: per-store discount codes with optional validity window
-- and usage cap. `type` controls how `value` is interpreted:
--   * 'percent'        -> value is 1-100 (percent off subtotal)
--   * 'fixed'          -> value is cents off subtotal
--   * 'free_shipping'  -> value is ignored, ongkir set to 0
CREATE TABLE IF NOT EXISTS promos (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    code                TEXT         NOT NULL,
    type                TEXT         NOT NULL CHECK (type IN ('percent', 'fixed', 'free_shipping')),
    value               BIGINT       NOT NULL DEFAULT 0,
    min_purchase_cents  BIGINT       NOT NULL DEFAULT 0,
    max_usage           INT          NOT NULL DEFAULT 0, -- 0 = unlimited
    used_count          INT          NOT NULL DEFAULT 0,
    starts_at           TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (store_id, code)
);
CREATE INDEX IF NOT EXISTS promos_store_idx ON promos (store_id);
