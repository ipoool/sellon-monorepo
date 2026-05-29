ALTER TABLE customers ADD COLUMN member_code TEXT;

-- Member codes are globally unique (a scanned code maps to exactly one
-- customer). NULL = not a member yet.
CREATE UNIQUE INDEX idx_customers_member_code ON customers (member_code) WHERE member_code IS NOT NULL;
