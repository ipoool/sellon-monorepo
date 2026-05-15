-- Platform-level role + ban flag on users. This is distinct from
-- store_members.role (per-store: owner/admin/staff). users.role gates
-- access to the cross-tenant /admin endpoints.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role      TEXT        NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin')),
    ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role) WHERE role <> 'user';

-- Seed: bootstrap the founding admin. No-op when the user hasn't logged
-- in yet (no row to update); subsequent runs are idempotent because
-- the WHERE clause matches the same row.
UPDATE users SET role = 'admin'
    WHERE LOWER(email) = LOWER('asepulloh0109@gmail.com');

-- Cross-tenant admin actions log. Lives separately from audit_log so
-- store-owner audit views aren't polluted with platform-side admin
-- activity.
CREATE TABLE IF NOT EXISTS platform_audit_log (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id        UUID         REFERENCES users(id) ON DELETE SET NULL,
    actor_email          TEXT         NOT NULL DEFAULT '',
    actor_name           TEXT         NOT NULL DEFAULT '',
    impersonator_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    action               TEXT         NOT NULL,
    target_user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
    target_store_id      UUID         REFERENCES stores(id) ON DELETE SET NULL,
    summary              TEXT         NOT NULL DEFAULT '',
    metadata             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_log_actor_idx
    ON platform_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_target_user_idx
    ON platform_audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_target_store_idx
    ON platform_audit_log (target_store_id, created_at DESC);

-- Track impersonator on the per-store audit_log too so admin-driven
-- mutations are visible in the seller's own activity feed.
ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS impersonator_user_id UUID
        REFERENCES users(id) ON DELETE SET NULL;
