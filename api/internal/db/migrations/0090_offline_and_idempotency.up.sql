-- Offline-first POS (Fase 1) foundations.

-- Per-store toggle to enable offline mode (caches catalog + queues orders on the
-- cashier device). Capability switch; actual offline behavior is per-device.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS offline_enabled BOOLEAN NOT NULL DEFAULT false;

-- Idempotency for order creation so a queued offline order replayed on
-- reconnect creates the order exactly once (no double-charge / double stock
-- decrement / double loyalty). Client generates one UUID per order; the create
-- path upserts on this key. Partial unique index ignores legacy NULL rows.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_idempotency_key_uniq
    ON orders (store_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Conflict flag: an offline order synced when stock was insufficient is still
-- created (cashier priority) but flagged for the seller to reconcile manually.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS needs_review  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS review_reason TEXT    NOT NULL DEFAULT '';
