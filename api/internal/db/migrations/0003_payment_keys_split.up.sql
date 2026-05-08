-- Split payment gateway credentials into separate sandbox and production key
-- pairs so users can store both without overwriting one when switching mode.

ALTER TABLE payment_gateway_credentials
    ADD COLUMN server_key_sandbox_encrypted BYTEA,
    ADD COLUMN server_key_prod_encrypted    BYTEA,
    ADD COLUMN client_key_sandbox           TEXT NOT NULL DEFAULT '',
    ADD COLUMN client_key_prod              TEXT NOT NULL DEFAULT '';

-- Backfill existing rows: assume the existing key belongs to whichever env
-- the row's is_sandbox flag indicates.
UPDATE payment_gateway_credentials SET
    server_key_sandbox_encrypted = CASE WHEN is_sandbox THEN server_key_encrypted END,
    server_key_prod_encrypted    = CASE WHEN NOT is_sandbox THEN server_key_encrypted END,
    client_key_sandbox = CASE WHEN is_sandbox THEN client_key ELSE '' END,
    client_key_prod    = CASE WHEN NOT is_sandbox THEN client_key ELSE '' END;

ALTER TABLE payment_gateway_credentials
    DROP COLUMN server_key_encrypted,
    DROP COLUMN client_key;
