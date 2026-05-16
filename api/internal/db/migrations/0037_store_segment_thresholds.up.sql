ALTER TABLE stores
  ADD COLUMN segment_vip_threshold   INT NOT NULL DEFAULT 10,
  ADD COLUMN segment_loyal_threshold INT NOT NULL DEFAULT 3;
