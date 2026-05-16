ALTER TABLE stores
  DROP COLUMN IF EXISTS segment_vip_threshold,
  DROP COLUMN IF EXISTS segment_loyal_threshold;
