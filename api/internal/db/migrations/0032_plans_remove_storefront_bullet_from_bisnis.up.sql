-- Bisnis sudah mencakup semua fitur Pro lewat bullet "Semua fitur Pro",
-- jadi bullet "6 template tampilan storefront" yang ditambah migration
-- 0031 redundant dan menambah noise di kartu harga. Hapus dari Bisnis;
-- Free dan Pro tetap.
UPDATE plans
SET features = COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements(features) elem
     WHERE elem <> '"6 template tampilan storefront"'::jsonb),
    '[]'::jsonb
)
WHERE tier = 'bisnis';
