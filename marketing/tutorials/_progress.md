# Progress — Artikel Tutorial SellOn

**Format final (29-05-2026): blog post HTML**, bukan markdown. Artikel hidup sebagai
`BlogPost` di `web/src/lib/tutorial-posts.ts`, di-render oleh `web/src/app/blog/[slug]/page.tsx`,
live di `/blog/<slug>`. Schema diperluas (additive): `section.image`, `coverImage`, `plan`.
Screenshot di `web/public/tutorials/<slug>/`. Cover nanobanana gaya B (karakter penjual UMKM).

Akun screenshot: **Toko Ijo** (Pro) untuk semua; **user demo "Budi"** untuk artikel Setup.

| # | Artikel | Slug | Status |
|---|---------|------|--------|
| 1 | Mulai Cepat: Setup Toko | mulai-cepat-setup-toko | ✅ |
| 2 | Kelola Produk | kelola-produk | ✅ |
| 3 | Resep & Opsi Produk | resep-opsi-produk | ✅ |
| 4 | Bulk Upload Produk | bulk-upload-produk | ✅ (bug bulk_jobs.go:109 sudah di-fix → `::int`) |
| 5 | Bahan Baku & Stok | bahan-baku-stok | ✅ |
| 6 | Pembelian (PO) & Supplier | pembelian-supplier | ✅ |
| 7 | Stok Opname | stok-opname | ✅ |
| 8 | Storefront Online | storefront-online | ✅ |
| 9 | Pesanan (Orders) | pesanan | ✅ |
| 10 | Kasir POS | kasir-pos | ✅ |
| 11 | Loyalty Poin | loyalty-poin | ✅ |
| 12 | Membership | membership | ✅ |
| 13 | Promo & Diskon | promo-diskon | ✅ |
| 14 | Pelanggan | pelanggan | ✅ |
| 15 | Laporan | laporan | ✅ |
| 16 | Analytics 360 | analytics-360 | ✅ |
| 17 | Dine-In: QR Meja + Self-Order | dine-in-qr-meja | ✅ |
| 18 | Kitchen Display & Antrian | kitchen-display-antrian | ✅ |
| 19 | Pembayaran | pembayaran | ✅ |
| 20 | Pengiriman & Ongkir | pengiriman-ongkir | ✅ |
| 21 | WhatsApp | whatsapp | ✅ |
| 22 | Tim & Akses | tim-akses | ✅ |
| 23 | Domain Kustom | domain-kustom | ✅ |
| 24 | Reseller/Dropship | reseller-dropship | ✅ |
| 25 | Langganan & Plan | langganan-plan | ✅ |


## CATATAN BUG (ditemukan saat QA)
- **#4 Bulk upload**: FIXED — `bulk_jobs.go:109` `$2+$3` → `$2::int + $3::int`. Job kini `completed` normal.
- **Storefront stok varian**: API `/storefront/{slug}` kirim `stock:0` untuk produk bervarian (tanpa agregasi stok varian) → katalog publik tampil "Stok habis" walau varian ada stok. Saat QA, base stock 21 produk di-set 99 (data demo) agar screenshot sehat. Perlu fix agregasi stok varian di storefront.
