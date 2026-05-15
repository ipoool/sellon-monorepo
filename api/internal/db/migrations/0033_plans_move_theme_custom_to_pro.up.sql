-- Pindah bullet "Tema toko custom (warna brand)" dari Bisnis ke Pro.
-- Bisnis tetap dapat fitur ini lewat bullet "Semua fitur Pro", jadi
-- redundant kalau dipertahankan di kedua tier.
UPDATE plans
SET features = features || '["Tema toko custom (warna brand)"]'::jsonb
WHERE tier = 'pro'
  AND NOT (features @> '["Tema toko custom (warna brand)"]'::jsonb);

UPDATE plans
SET features = COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements(features) elem
     WHERE elem <> '"Tema toko custom (warna brand)"'::jsonb),
    '[]'::jsonb
)
WHERE tier = 'bisnis';
