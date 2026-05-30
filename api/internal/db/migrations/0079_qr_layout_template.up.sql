-- QR card layout template + headline text for the printable table-QR card.
-- qr_bg_color/qr_fg_color are reused as the card background + text colors;
-- the QR modules themselves stay dark-on-white for reliable scanning.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS qr_layout   TEXT NOT NULL DEFAULT 'classic',
    ADD COLUMN IF NOT EXISTS qr_headline TEXT NOT NULL DEFAULT '';
