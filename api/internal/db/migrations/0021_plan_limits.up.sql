-- Per-tier enforcement caps, source-of-truth in Postgres so admin can
-- tune via /admin/plans without a deploy. -1 means unlimited.
--
-- Seed values mirror the previous hardcoded constants in
-- api/internal/handler/tier_limits.go on 2026-05-10:
--   free:   product=30,  staff=1,  order=50,  promo=-1 (no prior cap)
--   pro:    product=-1,  staff=5,  order=-1,  promo=-1
--   bisnis: product=-1,  staff=-1, order=-1,  promo=-1
--
-- promo_limit is new in this migration; default -1 keeps existing
-- behavior (unlimited promo codes) until admin sets a cap.
ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS product_limit       INT NOT NULL DEFAULT -1,
    ADD COLUMN IF NOT EXISTS staff_limit         INT NOT NULL DEFAULT -1,
    ADD COLUMN IF NOT EXISTS order_monthly_limit INT NOT NULL DEFAULT -1,
    ADD COLUMN IF NOT EXISTS promo_limit         INT NOT NULL DEFAULT -1;

UPDATE plans SET
    product_limit       = 30,
    staff_limit         = 1,
    order_monthly_limit = 50
WHERE tier = 'free';

UPDATE plans SET
    staff_limit = 5
WHERE tier = 'pro';
-- pro and bisnis already get -1 defaults for the unlimited fields.
