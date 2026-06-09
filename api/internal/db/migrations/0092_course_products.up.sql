-- Course product type: a product whose content is an ordered list of videos
-- (YouTube links for now), each with a markdown description. Delivered like a
-- digital product (no shipping/stock) but watched on an OTP-gated viewer page.

-- Widen the product_type CHECK on products + order_items to allow 'course'.
-- (Postgres can't ALTER a CHECK in place — drop + re-add. Constraint names
-- verified via pg_constraint.)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('physical', 'digital', 'course'));

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_type_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_type_check
    CHECK (product_type IN ('physical', 'digital', 'course'));

-- Course content: ordered list of videos per course product (mirrors the
-- variants/modifier_groups child-table pattern; batch-replaced on save).
CREATE TABLE IF NOT EXISTS course_videos (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id     UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    title          TEXT        NOT NULL DEFAULT '',
    youtube_url    TEXT        NOT NULL,
    description_md TEXT        NOT NULL DEFAULT '',
    sort_order     INT         NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_videos_product_idx ON course_videos (product_id, sort_order);

-- Buyer email-OTP for course access — scoped per course link (download token).
-- One active row per (token_id, email): request-otp upserts it (resend),
-- carrying Postgres-side rate-limit counters (no Redis client is wired).
CREATE TABLE IF NOT EXISTS buyer_otps (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    token_id      UUID        NOT NULL REFERENCES download_tokens(id) ON DELETE CASCADE,
    email         TEXT        NOT NULL,
    code_hash     TEXT        NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    attempt_count INT         NOT NULL DEFAULT 0,
    resend_count  INT         NOT NULL DEFAULT 0,
    last_sent_at  TIMESTAMPTZ,
    consumed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS buyer_otps_token_email_uniq ON buyer_otps (token_id, email);
