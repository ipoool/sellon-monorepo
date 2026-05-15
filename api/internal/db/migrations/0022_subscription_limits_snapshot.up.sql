-- Snapshot per-tier limits onto each subscription so admin edits to
-- `plans.product_limit` etc. don't retroactively change the caps that
-- existing subscribers signed up under.
--
-- Decision (2026-05-10): renewal of the SAME plan keeps the existing
-- snapshot; only a plan CHANGE (free → pro, pro → bisnis, expire to
-- free, admin grant to a different tier) re-snapshots from `plans`.
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS product_limit       INT,
    ADD COLUMN IF NOT EXISTS staff_limit         INT,
    ADD COLUMN IF NOT EXISTS order_monthly_limit INT,
    ADD COLUMN IF NOT EXISTS promo_limit         INT;

-- Backfill: every existing subscription gets a snapshot of its current
-- plan's limits so day-1 behavior after deploy matches the old live
-- read. Anything still NULL after this (e.g. unknown tier) gets -1
-- (unlimited / fail-open) via the NOT NULL DEFAULT below.
UPDATE subscriptions s
SET product_limit       = p.product_limit,
    staff_limit         = p.staff_limit,
    order_monthly_limit = p.order_monthly_limit,
    promo_limit         = p.promo_limit
FROM plans p
WHERE p.tier = s.plan
  AND s.product_limit IS NULL;

UPDATE subscriptions
SET product_limit       = COALESCE(product_limit, -1),
    staff_limit         = COALESCE(staff_limit, -1),
    order_monthly_limit = COALESCE(order_monthly_limit, -1),
    promo_limit         = COALESCE(promo_limit, -1);

ALTER TABLE subscriptions
    ALTER COLUMN product_limit       SET DEFAULT -1,
    ALTER COLUMN staff_limit         SET DEFAULT -1,
    ALTER COLUMN order_monthly_limit SET DEFAULT -1,
    ALTER COLUMN promo_limit         SET DEFAULT -1,
    ALTER COLUMN product_limit       SET NOT NULL,
    ALTER COLUMN staff_limit         SET NOT NULL,
    ALTER COLUMN order_monthly_limit SET NOT NULL,
    ALTER COLUMN promo_limit         SET NOT NULL;
