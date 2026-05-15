-- Digital product support. Two delivery channels: external URL (mis.
-- Google Drive, Notion, redeem code) and uploaded file (Supabase
-- Storage). Sellers can use either / both. Stock is unused for
-- digital — kept on the row but ignored at storefront.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS product_type         TEXT NOT NULL DEFAULT 'physical'
        CHECK (product_type IN ('physical', 'digital')),
    ADD COLUMN IF NOT EXISTS digital_delivery_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS digital_file_url     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS digital_instructions TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS products_type_idx ON products (store_id, product_type);

-- Denormalize on order_items so checkout / fulfillment hot paths don't
-- need to JOIN products to know whether a row is digital.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'physical'
        CHECK (product_type IN ('physical', 'digital'));

-- Token-protected download links. One token per order_item — not per
-- order — so multi-product orders can deliver each item separately
-- (e.g. one ebook + one course). Tokens are random URL-safe strings;
-- we don't index by anything else, so a leaked token is leaked, but
-- guessability is the same as a UUIDv4 with 32 bytes of entropy.
CREATE TABLE IF NOT EXISTS download_tokens (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    token           TEXT         NOT NULL UNIQUE,
    order_id        UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id   UUID         NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    store_id        UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ,            -- NULL = never expires
    consumed_count  INT          NOT NULL DEFAULT 0,
    last_consumed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS download_tokens_order_idx ON download_tokens (order_id);

-- Buyer email is now relevant (delivery link goes there). Existing
-- orders had no email captured — stays empty until next checkout.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_email TEXT NOT NULL DEFAULT '';
