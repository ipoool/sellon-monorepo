-- Re-append bullet ke Bisnis kalau di-rollback.
UPDATE plans
SET features = features || '["6 template tampilan storefront"]'::jsonb
WHERE tier = 'bisnis'
  AND NOT (features @> '["6 template tampilan storefront"]'::jsonb);
