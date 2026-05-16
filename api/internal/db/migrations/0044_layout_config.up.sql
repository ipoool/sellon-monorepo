ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS layout_config JSONB DEFAULT '{}'::jsonb;
