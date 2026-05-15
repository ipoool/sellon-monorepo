-- Per-store audit log. Records who did what to which entity. Kept
-- intentionally generic: action is a free-form verb (e.g.
-- "order.status_changed", "staff.role_changed"), entity is the noun the
-- action targets, and metadata is a small JSON payload with the diff.
--
-- We log mutations only — reads are out of scope. Failed actions are
-- not logged either; only successful, committed mutations call the
-- helper.
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    actor_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    actor_email   TEXT         NOT NULL DEFAULT '',
    actor_name    TEXT         NOT NULL DEFAULT '',
    action        TEXT         NOT NULL,
    entity_type   TEXT         NOT NULL DEFAULT '',
    entity_id     TEXT         NOT NULL DEFAULT '',
    summary       TEXT         NOT NULL DEFAULT '',
    metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_store_created_idx
    ON audit_log (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx
    ON audit_log (store_id, action, created_at DESC);
