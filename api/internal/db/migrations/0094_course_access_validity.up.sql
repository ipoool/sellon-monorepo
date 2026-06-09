-- Course access validity ("masa aktif kursus"): the seller can cap how long a
-- buyer's course access stays valid. Default = lifetime (seumur hidup); can be
-- set to a range of N weeks/months/years. Stored as value + unit so the form
-- round-trips exactly and month/year expiry is computed calendar-correctly
-- (AddDate) at token-mint time. value=0 / unit='lifetime' means no expiry.
--
-- Generic product-level columns (not course-specific) so the same mechanism can
-- later apply to digital products; today only the course form exposes a control.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS access_validity_value INT  NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS access_validity_unit  TEXT NOT NULL DEFAULT 'lifetime';

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_access_validity_unit_check;
ALTER TABLE products ADD CONSTRAINT products_access_validity_unit_check
    CHECK (access_validity_unit IN ('lifetime', 'week', 'month', 'year'));
