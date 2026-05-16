ALTER TABLE stores
  DROP COLUMN IF EXISTS segment_baru_name,
  DROP COLUMN IF EXISTS segment_reguler_name,
  DROP COLUMN IF EXISTS segment_loyal_name,
  DROP COLUMN IF EXISTS segment_vip_name;
