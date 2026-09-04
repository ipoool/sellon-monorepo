-- Custom-domain squatting / dangling-CNAME fix.
--
-- Before: `stores.custom_domain` carried a plain UNIQUE constraint, so
-- merely TYPING a domain (status stays 'pending' until DNS verification)
-- reserved it globally and blocked the rightful owner with a 409 — no
-- proof of ownership required.
--
-- After: uniqueness applies only to domains that are actually ACTIVE.
-- A domain held in pending/failed/none by someone else can still be
-- claimed and verified by its real owner; two stores can never serve the
-- same domain at once. Ownership itself is proven by the per-store
-- `_sellon-verify.<domain>` TXT record checked in handler/domain.go.
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_custom_domain_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_stores_custom_domain_active
  ON stores (custom_domain)
  WHERE custom_domain IS NOT NULL AND domain_status = 'active';
