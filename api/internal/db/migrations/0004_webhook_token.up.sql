-- Each gateway gets a unique random webhook token.
-- The seller copies the URL https://api.sellon.id/webhooks/midtrans/{token}
-- into their Midtrans dashboard so payment status updates flow back to us.
--
-- We use md5(random || clock_timestamp) for backfill so this migration runs
-- without requiring the pgcrypto extension. New rows get their token from
-- the Go side via crypto/rand (see payments.go).

ALTER TABLE payment_gateway_credentials
    ADD COLUMN webhook_token TEXT;

UPDATE payment_gateway_credentials
SET webhook_token = md5(random()::text || clock_timestamp()::text)
WHERE webhook_token IS NULL;

ALTER TABLE payment_gateway_credentials
    ALTER COLUMN webhook_token SET NOT NULL,
    ADD CONSTRAINT payment_gateway_credentials_webhook_token_key UNIQUE (webhook_token);

CREATE INDEX IF NOT EXISTS payment_gateway_credentials_webhook_token_idx
    ON payment_gateway_credentials (webhook_token);
