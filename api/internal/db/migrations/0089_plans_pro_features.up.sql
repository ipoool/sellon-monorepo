-- Surface Pro-gated features that were live in the product but missing from the
-- Pro pricing card: Meta integration (feat MetaIntegration), bulk XLSX upload
-- (product_bulk.go proGate), inventory/materials + purchase orders (materials.go
-- + purchasing.go proGate), and the reseller/dropship program (reseller.go
-- requireProPlan). All are Pro-and-up; Bisnis inherits them via its existing
-- "Semua fitur Pro" bullet, so only the Pro row changes.
UPDATE plans
SET features = '[
    "Template pesan WhatsApp",
    "Integrasi kurir & ongkir otomatis",
    "Laporan lengkap & export CSV",
    "6 template tampilan storefront",
    "Tema toko custom (warna brand)",
    "Integrasi Meta (Facebook & Instagram)",
    "Upload produk massal via Excel",
    "Bahan baku, resep/HPP & purchase order",
    "Program reseller & dropship"
]'::jsonb
WHERE tier = 'pro';
