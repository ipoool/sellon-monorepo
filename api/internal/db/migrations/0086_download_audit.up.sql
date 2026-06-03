-- Digital download audit: per-access log (IP, user-agent, time) so sellers can
-- spot a buyer sharing their download link, plus a per-link revoke flag.

-- Per-link revoke. NULL = active; set to now() to disable a leaked link.
ALTER TABLE download_tokens
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- One row per time a download link is opened. customer_id is nullable because
-- a token's order may have no linked customer (anonymous order).
CREATE TABLE IF NOT EXISTS download_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id      UUID        NOT NULL REFERENCES download_tokens(id) ON DELETE CASCADE,
    store_id      UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID        NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    customer_id   UUID        REFERENCES customers(id) ON DELETE SET NULL,
    ip_address    TEXT        NOT NULL DEFAULT '',
    user_agent    TEXT        NOT NULL DEFAULT '',
    -- true = hit on a revoked/expired link (audited so the seller sees
    -- continued abuse after revoke, but excluded from the share counts).
    blocked       BOOLEAN     NOT NULL DEFAULT false,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS download_logs_store_idx ON download_logs (store_id, downloaded_at DESC);
CREATE INDEX IF NOT EXISTS download_logs_token_idx ON download_logs (token_id);
CREATE INDEX IF NOT EXISTS download_logs_customer_idx ON download_logs (customer_id);
