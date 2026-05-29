-- Tiered volume discount per product: "Beli ≥ N qty, dapat potongan X% atau Rp Y".
-- starts_at/ends_at NULL artinya tidak ada batas waktu (selalu berlaku selama is_active).
CREATE TABLE IF NOT EXISTS product_discounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    min_quantity    INT         NOT NULL CHECK (min_quantity >= 1),
    discount_type   TEXT        NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value  BIGINT      NOT NULL CHECK (discount_value >= 0),
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_discounts_product_idx ON product_discounts (product_id) WHERE is_active;
