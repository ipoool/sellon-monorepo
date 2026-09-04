-- Payment-integrity hardening.
--
-- 1) One download token per order_item. fulfillment.OnPaymentPaid claims to be
--    idempotent but nothing enforced it: two "paid" transitions minted two
--    tokens and sent two delivery emails. Collapse any historical duplicates
--    (keep the earliest row per item) then enforce it in the schema.
DELETE FROM download_tokens dt
WHERE EXISTS (
    SELECT 1 FROM download_tokens keep
    WHERE keep.order_item_id = dt.order_item_id
      AND (keep.created_at, keep.id) < (dt.created_at, dt.id)
);

CREATE UNIQUE INDEX IF NOT EXISTS download_tokens_item_uniq
    ON download_tokens (order_item_id);

-- 2) Refund claim flag. The seller refund path calls Midtrans BEFORE any DB
--    validation, so a double-click could move money twice with no DB record.
--    The claim is taken atomically first; Midtrans is only called once the
--    claim is held, and it is released when Midtrans rejects the refund.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS refund_pending BOOLEAN NOT NULL DEFAULT false;

-- 3) Hot list paths filter by store_id and sort by created_at DESC with a
--    LIMIT. With only single-column indexes Postgres sorts the store's whole
--    history on every page load.
CREATE INDEX IF NOT EXISTS orders_store_created_idx
    ON orders (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_store_created_idx
    ON products (store_id, created_at DESC);
