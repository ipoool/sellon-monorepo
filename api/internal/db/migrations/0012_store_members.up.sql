-- Multi-user / staff: a store can have one owner + multiple staff/admin
-- members. Existing FindByOwnerID call sites (~13 handlers) keep working
-- because the owner row is backfilled below.
CREATE TABLE IF NOT EXISTS store_members (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT         NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (store_id, user_id)
);
CREATE INDEX IF NOT EXISTS store_members_user_idx ON store_members (user_id);
CREATE INDEX IF NOT EXISTS store_members_store_idx ON store_members (store_id);

-- Backfill: every existing store's owner becomes a 'owner' member.
INSERT INTO store_members (store_id, user_id, role)
SELECT id, owner_id, 'owner' FROM stores
ON CONFLICT (store_id, user_id) DO NOTHING;

-- Pending invites: lookup by email so users who haven't logged in yet
-- can be invited. Accepted on first login matching the email.
CREATE TABLE IF NOT EXISTS store_invites (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    email       TEXT         NOT NULL,
    role        TEXT         NOT NULL CHECK (role IN ('admin', 'staff')),
    invited_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_invites_email_idx
    ON store_invites (LOWER(email)) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS store_invites_store_idx
    ON store_invites (store_id);
