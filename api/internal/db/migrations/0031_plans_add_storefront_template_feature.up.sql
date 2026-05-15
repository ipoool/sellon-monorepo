-- Tambah bullet "Template tampilan storefront" ke features tiap tier.
-- Free dikunci ke layout 'grid' (lihat storefront-form.tsx ProductLayoutCard);
-- Pro/Bisnis bisa pilih 6 template (grid, list, sorotan, padat, majalah, feed).
--
-- Pakai jsonb || untuk append agar tidak overwrite bullet yang sudah
-- ada (admin mungkin edit manual via /platform/plans).
UPDATE plans
SET features = features || '["Tampilan storefront grid"]'::jsonb
WHERE tier = 'free'
  AND NOT (features @> '["Tampilan storefront grid"]'::jsonb);

UPDATE plans
SET features = features || '["6 template tampilan storefront"]'::jsonb
WHERE tier = 'pro'
  AND NOT (features @> '["6 template tampilan storefront"]'::jsonb);

UPDATE plans
SET features = features || '["6 template tampilan storefront"]'::jsonb
WHERE tier = 'bisnis'
  AND NOT (features @> '["6 template tampilan storefront"]'::jsonb);
