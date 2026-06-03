-- Restore the Pro features list to its pre-0089 state.
UPDATE plans
SET features = '[
    "Template pesan WhatsApp",
    "Integrasi kurir & ongkir otomatis",
    "Laporan lengkap & export CSV",
    "6 template tampilan storefront",
    "Tema toko custom (warna brand)"
]'::jsonb
WHERE tier = 'pro';
