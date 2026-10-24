-- Where sellers send their subscription payment.
--
-- These four strings lived in the frontend bundle as constants marked
-- "hard-coded for MVP". Manual bank transfer is now the only way to pay
-- for a subscription, which makes the account number the single most
-- load-bearing string in the product: wrong, and money goes somewhere
-- nobody can reconcile. Changing it should not require a deploy.
--
-- Single row, boolean-PK trick, same as photobooth_settings: a second row
-- is impossible rather than merely discouraged.
CREATE TABLE IF NOT EXISTS billing_settings (
    id             BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
    bank_name      TEXT        NOT NULL DEFAULT '',
    account_number TEXT        NOT NULL DEFAULT '',
    account_name   TEXT        NOT NULL DEFAULT '',
    -- Digits only, country code included (6281…). The frontend builds a
    -- wa.me link from it, so a leading + or spaces would break the link
    -- quietly.
    support_whatsapp TEXT      NOT NULL DEFAULT ''
        CHECK (support_whatsapp = '' OR support_whatsapp ~ '^[0-9]{8,20}$'),
    -- Optional extra line under the transfer steps (e.g. "cantumkan nama
    -- toko di berita transfer").
    note           TEXT        NOT NULL DEFAULT '',
    updated_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seeded with the values the frontend has been shipping, so the switch to
-- a database-backed source changes nothing visible on the day it lands.
INSERT INTO billing_settings (id, bank_name, account_number, account_name, support_whatsapp)
VALUES (true, 'BCA', '2040144776', 'Asep Saepulloh', '6281291006534')
ON CONFLICT DO NOTHING;
