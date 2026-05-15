-- Marketing metadata per-tier yang sebelumnya hard-coded di frontend
-- (web/src/components/home/pricing.tsx → tierMeta). Pindah ke DB
-- supaya admin bisa edit description / fitur / label tombol tanpa
-- deploy ulang.
--
-- features pakai JSONB array of strings supaya admin bisa add/remove
-- bullet lewat UI tanpa schema migration tiap kali.
ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS description           TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS features              JSONB   NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS cta_label             TEXT    NOT NULL DEFAULT 'Pilih Paket',
    ADD COLUMN IF NOT EXISTS period_monthly_label  TEXT    NOT NULL DEFAULT '/ bulan',
    ADD COLUMN IF NOT EXISTS period_yearly_label   TEXT    NOT NULL DEFAULT '/ bulan, ditagih tahunan',
    ADD COLUMN IF NOT EXISTS highlighted           BOOLEAN NOT NULL DEFAULT false;

-- Seed nilai yang dulu hard-coded di frontend.
UPDATE plans SET
    description = 'Cukup untuk warung dan toko kecil yang baru mulai online.',
    features = '["Pembayaran QRIS, transfer, e-wallet", "Laporan dasar"]'::jsonb,
    cta_label = 'Mulai Gratis',
    period_monthly_label = 'selamanya',
    period_yearly_label = 'selamanya',
    highlighted = false
WHERE tier = 'free';

UPDATE plans SET
    description = 'Untuk toko yang sudah punya pelanggan tetap.',
    features = '["Template pesan WhatsApp", "Integrasi kurir & ongkir otomatis", "Laporan lengkap & export CSV"]'::jsonb,
    cta_label = 'Pilih Pro',
    period_monthly_label = '/ bulan',
    period_yearly_label = '/ bulan, ditagih tahunan',
    highlighted = true
WHERE tier = 'pro';

UPDATE plans SET
    description = 'Untuk brand yang sudah jalan dan butuh banyak admin.',
    features = '["Semua fitur Pro", "Tema toko custom (warna brand)", "Domain custom (segera)", "Support via email & WhatsApp"]'::jsonb,
    cta_label = 'Pilih Bisnis',
    period_monthly_label = '/ bulan',
    period_yearly_label = '/ bulan, ditagih tahunan',
    highlighted = false
WHERE tier = 'bisnis';
