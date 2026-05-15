-- Reverse only the rows that match the values 0024 set. If admin
-- retuned them after the up migration, we don't blast the new value.
UPDATE plans SET order_monthly_limit = -1 WHERE tier = 'pro'    AND order_monthly_limit = 200;
UPDATE plans SET order_monthly_limit = -1 WHERE tier = 'bisnis' AND order_monthly_limit = 600;
