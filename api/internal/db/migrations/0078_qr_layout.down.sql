ALTER TABLE stores
    DROP COLUMN IF EXISTS qr_fg_color,
    DROP COLUMN IF EXISTS qr_bg_color,
    DROP COLUMN IF EXISTS qr_caption;
