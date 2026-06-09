-- Seller profiling → which sidebar menu groups a store sees. Caps default true
-- so existing sellers' menus are unchanged at rollout; profiling_completed_at
-- (NULL = not done) independently drives the forced onboarding dialog.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS cap_pos       BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS cap_reseller  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS cap_digital   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS cap_materials BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS seller_types  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS profiling_completed_at TIMESTAMPTZ;
