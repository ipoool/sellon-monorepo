ALTER TABLE payment_gateway_credentials
    ADD COLUMN server_key_encrypted BYTEA,
    ADD COLUMN client_key           TEXT NOT NULL DEFAULT '';

UPDATE payment_gateway_credentials SET
    server_key_encrypted = COALESCE(server_key_sandbox_encrypted, server_key_prod_encrypted),
    client_key = CASE WHEN is_sandbox THEN client_key_sandbox ELSE client_key_prod END;

ALTER TABLE payment_gateway_credentials
    DROP COLUMN server_key_sandbox_encrypted,
    DROP COLUMN server_key_prod_encrypted,
    DROP COLUMN client_key_sandbox,
    DROP COLUMN client_key_prod;
