-- Custom QR card appearance for dine-in table QRs: module color, background
-- color, and caption text. Per-store, part of the dine-in settings block.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS qr_fg_color TEXT NOT NULL DEFAULT '#0F172A',
    ADD COLUMN IF NOT EXISTS qr_bg_color TEXT NOT NULL DEFAULT '#FFFFFF',
    ADD COLUMN IF NOT EXISTS qr_caption  TEXT NOT NULL DEFAULT 'Scan untuk pesan';
