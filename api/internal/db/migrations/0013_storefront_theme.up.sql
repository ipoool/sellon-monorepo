-- Storefront customization: per-store theme + visibility toggles.
-- theme_hue: OKLCH hue 0-360 used as the brand color of the public toko
-- page. Default 145 = the same green as the SellOn brand.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS theme_hue            INT     NOT NULL DEFAULT 145
        CHECK (theme_hue BETWEEN 0 AND 360),
    ADD COLUMN IF NOT EXISTS show_hours_public    BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_social_public   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS footer_text          TEXT    NOT NULL DEFAULT '';
