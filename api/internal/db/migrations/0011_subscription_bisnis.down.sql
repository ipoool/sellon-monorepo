-- Revert: any 'bisnis' rows must be downgraded first or this will fail.
ALTER TABLE subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_plan_check
    CHECK (plan IN ('free', 'pro'));
