ALTER TABLE plans
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS features,
    DROP COLUMN IF EXISTS cta_label,
    DROP COLUMN IF EXISTS period_monthly_label,
    DROP COLUMN IF EXISTS period_yearly_label,
    DROP COLUMN IF EXISTS highlighted;
