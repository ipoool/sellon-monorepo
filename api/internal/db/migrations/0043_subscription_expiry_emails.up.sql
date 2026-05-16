CREATE TABLE subscription_expiry_emails (
    store_id          UUID        NOT NULL,
    notification_type TEXT        NOT NULL CHECK (notification_type IN ('h3', 'h0')),
    period_end        DATE        NOT NULL,
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, notification_type, period_end)
);
