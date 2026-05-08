DROP INDEX IF EXISTS payment_gateway_credentials_webhook_token_idx;
ALTER TABLE payment_gateway_credentials
    DROP CONSTRAINT IF EXISTS payment_gateway_credentials_webhook_token_key,
    DROP COLUMN webhook_token;
