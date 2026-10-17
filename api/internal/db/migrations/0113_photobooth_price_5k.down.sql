ALTER TABLE photobooth_settings
    ALTER COLUMN default_price_cents SET DEFAULT 2500000;

UPDATE photobooth_settings
SET default_price_cents = 2500000, updated_at = now()
WHERE id = true AND default_price_cents = 500000;
