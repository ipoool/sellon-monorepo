-- Stores: one per user (the seller's shop). Created on first sign-in via setup wizard.
CREATE TABLE IF NOT EXISTS stores (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug            TEXT         NOT NULL UNIQUE,
    name            TEXT         NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    logo_url        TEXT         NOT NULL DEFAULT '',
    category        TEXT         NOT NULL DEFAULT '',
    city            TEXT         NOT NULL DEFAULT '',
    whatsapp_number TEXT         NOT NULL DEFAULT '',
    instagram       TEXT         NOT NULL DEFAULT '',
    tiktok          TEXT         NOT NULL DEFAULT '',
    open_hours      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    is_open         BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stores_owner_idx ON stores (owner_id);

-- BYO payment gateway credentials. AES-GCM encrypted server-side using JWT_SECRET-derived key.
CREATE TABLE IF NOT EXISTS payment_gateway_credentials (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id              UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    provider              TEXT         NOT NULL,
    server_key_encrypted  BYTEA        NOT NULL,
    client_key            TEXT         NOT NULL DEFAULT '',
    is_sandbox            BOOLEAN      NOT NULL DEFAULT true,
    enabled_methods       TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    last_verified_at      TIMESTAMPTZ,
    last_verify_status    TEXT         NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (store_id, provider)
);

-- Manual bank account fallback (for free tier without gateway).
CREATE TABLE IF NOT EXISTS bank_accounts (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id     UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    bank_name    TEXT         NOT NULL,
    holder_name  TEXT         NOT NULL,
    account_no   TEXT         NOT NULL,
    is_primary   BOOLEAN      NOT NULL DEFAULT false,
    qris_url     TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_accounts_store_idx ON bank_accounts (store_id);

-- Product categories per store.
CREATE TABLE IF NOT EXISTS product_categories (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name        TEXT         NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_categories_store_idx ON product_categories (store_id);

-- Products. price_cents = lowest variant price (denormalized for list view).
CREATE TABLE IF NOT EXISTS products (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_id   UUID         REFERENCES product_categories(id) ON DELETE SET NULL,
    name          TEXT         NOT NULL,
    slug          TEXT         NOT NULL,
    description   TEXT         NOT NULL DEFAULT '',
    price_cents   BIGINT       NOT NULL DEFAULT 0,
    stock         INT          NOT NULL DEFAULT 0,
    weight_g      INT          NOT NULL DEFAULT 0,
    length_cm     INT          NOT NULL DEFAULT 0,
    width_cm      INT          NOT NULL DEFAULT 0,
    height_cm     INT          NOT NULL DEFAULT 0,
    status        TEXT         NOT NULL DEFAULT 'active',
    photo_urls    TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    has_variants  BOOLEAN      NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (store_id, slug),
    CHECK (status IN ('active', 'inactive', 'sold_out'))
);
CREATE INDEX IF NOT EXISTS products_store_idx ON products (store_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON products (status);

-- Product variants (e.g., ukuran S/M/L). NULL allowed for products without variants.
CREATE TABLE IF NOT EXISTS product_variants (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name         TEXT         NOT NULL,
    sku          TEXT         NOT NULL DEFAULT '',
    price_cents  BIGINT       NOT NULL DEFAULT 0,
    stock        INT          NOT NULL DEFAULT 0,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id);

-- Customers — built up automatically from order history.
CREATE TABLE IF NOT EXISTS customers (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name            TEXT         NOT NULL,
    whatsapp_number TEXT         NOT NULL,
    email           TEXT         NOT NULL DEFAULT '',
    address         TEXT         NOT NULL DEFAULT '',
    city            TEXT         NOT NULL DEFAULT '',
    province        TEXT         NOT NULL DEFAULT '',
    postal_code     TEXT         NOT NULL DEFAULT '',
    notes           TEXT         NOT NULL DEFAULT '',
    is_blacklisted  BOOLEAN      NOT NULL DEFAULT false,
    total_orders    INT          NOT NULL DEFAULT 0,
    total_spent_cents BIGINT     NOT NULL DEFAULT 0,
    last_order_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (store_id, whatsapp_number)
);
CREATE INDEX IF NOT EXISTS customers_store_idx ON customers (store_id);

-- Orders.
CREATE TABLE IF NOT EXISTS orders (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id           UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id        UUID         REFERENCES customers(id) ON DELETE SET NULL,
    order_number       TEXT         NOT NULL,
    status             TEXT         NOT NULL DEFAULT 'pending',
    payment_status     TEXT         NOT NULL DEFAULT 'unpaid',
    payment_method     TEXT         NOT NULL DEFAULT '',
    subtotal_cents     BIGINT       NOT NULL DEFAULT 0,
    shipping_cents     BIGINT       NOT NULL DEFAULT 0,
    total_cents        BIGINT       NOT NULL DEFAULT 0,
    courier            TEXT         NOT NULL DEFAULT '',
    courier_service    TEXT         NOT NULL DEFAULT '',
    tracking_number    TEXT         NOT NULL DEFAULT '',
    customer_name      TEXT         NOT NULL DEFAULT '',
    customer_whatsapp  TEXT         NOT NULL DEFAULT '',
    customer_address   TEXT         NOT NULL DEFAULT '',
    customer_city      TEXT         NOT NULL DEFAULT '',
    notes              TEXT         NOT NULL DEFAULT '',
    seller_notes       TEXT         NOT NULL DEFAULT '',
    payment_url        TEXT         NOT NULL DEFAULT '',
    paid_at            TIMESTAMPTZ,
    shipped_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    cancelled_at       TIMESTAMPTZ,
    cancellation_reason TEXT        NOT NULL DEFAULT '',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (store_id, order_number),
    CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled')),
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded'))
);
CREATE INDEX IF NOT EXISTS orders_store_idx ON orders (store_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);

-- Order line items.
CREATE TABLE IF NOT EXISTS order_items (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID         REFERENCES products(id) ON DELETE SET NULL,
    variant_id      UUID         REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name    TEXT         NOT NULL,
    variant_name    TEXT         NOT NULL DEFAULT '',
    unit_price_cents BIGINT      NOT NULL,
    quantity        INT          NOT NULL,
    subtotal_cents  BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

-- WhatsApp message templates per store. Seller can edit each.
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    template_key TEXT        NOT NULL,
    body        TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (store_id, template_key)
);
