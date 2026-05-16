ALTER TABLE stores
  ADD COLUMN custom_domain      TEXT        UNIQUE,
  ADD COLUMN domain_status      TEXT        NOT NULL DEFAULT 'none'
                                  CHECK (domain_status IN ('none', 'pending', 'active', 'failed')),
  ADD COLUMN domain_verified_at TIMESTAMPTZ;

-- Partial index: only index non-null domains for fast O(1) lookup.
CREATE INDEX IF NOT EXISTS idx_stores_custom_domain
  ON stores (custom_domain)
  WHERE custom_domain IS NOT NULL;
