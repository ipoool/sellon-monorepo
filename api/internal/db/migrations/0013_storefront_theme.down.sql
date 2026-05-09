ALTER TABLE stores
    DROP COLUMN IF EXISTS footer_text,
    DROP COLUMN IF EXISTS show_social_public,
    DROP COLUMN IF EXISTS show_hours_public,
    DROP COLUMN IF EXISTS theme_hue;
