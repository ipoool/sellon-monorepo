-- digital_stock_limit caps how many units of a non-physical product (digital +
-- course) can be sold. NULL = unlimited (the default, matching prior behavior).
-- A non-negative integer is the remaining sellable quantity: it decrements per
-- order atomically (oversell-safe, like physical stock) and is "sold out" at 0.
-- Physical products keep using the stock column instead.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS digital_stock_limit INT
        CHECK (digital_stock_limit IS NULL OR digital_stock_limit >= 0);
