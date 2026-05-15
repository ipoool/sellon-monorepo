-- Hapus bullet template storefront dari features tiap tier.
-- jsonb '-' value tidak ada di pg16; pakai jsonb_path_query / array filter.
UPDATE plans
SET features = COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements(features) elem
     WHERE elem <> '"Tampilan storefront grid"'::jsonb),
    '[]'::jsonb
)
WHERE tier = 'free';

UPDATE plans
SET features = COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements(features) elem
     WHERE elem <> '"6 template tampilan storefront"'::jsonb),
    '[]'::jsonb
)
WHERE tier IN ('pro', 'bisnis');
