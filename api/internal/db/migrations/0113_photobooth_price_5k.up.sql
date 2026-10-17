-- PhotoBoost: Rp 5.000 per print, and no frames for now.
--
-- The booth opens on thermal paper only: one payment, one strip, Rp 5.000.
-- The Rp 25.000 the table was seeded with was a placeholder from before the
-- hardware was chosen, and a photo-strip-on-receipt-paper is not a
-- Rp 25.000 product.
--
-- Both values stay admin-editable — this only moves the starting point.
ALTER TABLE photobooth_settings
    ALTER COLUMN default_price_cents SET DEFAULT 500000;

-- Only move the live row if it still holds the seeded placeholder. An
-- operator who already set their own price has made a decision, and a
-- migration must not quietly overrule it.
UPDATE photobooth_settings
SET default_price_cents = 500000, updated_at = now()
WHERE id = true AND default_price_cents = 2500000;

-- Frames and stickers are switched off while the booth runs on thermal
-- paper: line art survives dithering, but choosing it costs the customer a
-- screen for something they cannot see until it is printed. The columns stay
-- so turning the feature back on is a settings change, not a migration.
UPDATE photobooth_settings
SET default_frames = '[]'::jsonb
WHERE id = true;
