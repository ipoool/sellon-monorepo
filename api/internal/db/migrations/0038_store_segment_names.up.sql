ALTER TABLE stores
  ADD COLUMN segment_baru_name    TEXT NOT NULL DEFAULT 'Baru',
  ADD COLUMN segment_reguler_name TEXT NOT NULL DEFAULT 'Reguler',
  ADD COLUMN segment_loyal_name   TEXT NOT NULL DEFAULT 'Loyal',
  ADD COLUMN segment_vip_name     TEXT NOT NULL DEFAULT 'VIP';
