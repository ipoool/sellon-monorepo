DROP INDEX IF EXISTS idx_stores_custom_domain;
ALTER TABLE stores
  DROP COLUMN IF EXISTS domain_verified_at,
  DROP COLUMN IF EXISTS domain_status,
  DROP COLUMN IF EXISTS custom_domain;
