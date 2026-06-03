DROP TABLE IF EXISTS download_logs;
ALTER TABLE download_tokens DROP COLUMN IF EXISTS revoked_at;
