DROP INDEX IF EXISTS uniq_stores_custom_domain_active;

-- Restore the global UNIQUE. May fail if duplicate non-active domains
-- were created while the partial index was in force; clean those first.
ALTER TABLE stores ADD CONSTRAINT stores_custom_domain_key UNIQUE (custom_domain);
