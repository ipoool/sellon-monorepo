ALTER TABLE store_invites
  ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days';

-- Backfill pending invites: expire 7 days after they were created.
UPDATE store_invites
SET expires_at = created_at + interval '7 days'
WHERE accepted_at IS NULL;
