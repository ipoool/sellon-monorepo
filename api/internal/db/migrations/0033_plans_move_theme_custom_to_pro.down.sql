-- Rollback: pindah balik ke Bisnis, hapus dari Pro.
UPDATE plans
SET features = features || '["Tema toko custom (warna brand)"]'::jsonb
WHERE tier = 'bisnis'
  AND NOT (features @> '["Tema toko custom (warna brand)"]'::jsonb);

UPDATE plans
SET features = COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements(features) elem
     WHERE elem <> '"Tema toko custom (warna brand)"'::jsonb),
    '[]'::jsonb
)
WHERE tier = 'pro';
