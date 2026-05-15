-- Tighten Pro/Bisnis monthly-order caps so the platform-funded Twilio
-- WhatsApp alert (~Rp 400/pesan kirim ke Indonesia) doesn't eat the
-- entire subscription margin.
--
-- Decision (2026-05-11, founder-approved):
--   Pro    Rp  99k/bulan → 200 order/bulan  (≈ Rp 80k Twilio, Rp 19k margin)
--   Bisnis Rp 299k/bulan → 600 order/bulan  (≈ Rp 240k Twilio, Rp 59k margin)
--
-- Idempotency: only flip rows still on the original "-1 / unlimited"
-- seed from migration 0021. If an admin has already retuned these
-- via /platform/plans, their value is respected.
--
-- Existing subscribers are NOT touched — the snapshot rule from
-- migration 0022 stands: anyone already paying for Pro/Bisnis keeps
-- their "unlimited" snapshot until they next change tier. This change
-- only takes effect for NEW Pro/Bisnis activations.
UPDATE plans SET order_monthly_limit = 200 WHERE tier = 'pro'    AND order_monthly_limit = -1;
UPDATE plans SET order_monthly_limit = 600 WHERE tier = 'bisnis' AND order_monthly_limit = -1;
