# SellOn — Brand & Feature Brief

> Referensi untuk workflow Claude (desain / konten / build). SellOn = SaaS WhatsApp-commerce untuk UMKM Indonesia. UI copy: **Bahasa Indonesia**. Model facilitator (seller pakai akun Midtrans sendiri; platform tidak memegang dana pembeli).

---

## 1. Brand & Design Tokens

### Warna brand (skala OKLCH, hue `145` = emerald/teal)
Sumber kebenaran = OKLCH (di `globals.css`). Hex = aproksimasi untuk tooling yang butuh hex.

| Token | OKLCH | Hex (≈) | Pakai untuk |
|---|---|---|---|
| `brand-50` | `oklch(0.97 0.025 145)` | `#EAF8EC` | background lembut, chip |
| `brand-100` | `oklch(0.94 0.06 145)` | `#D3F1D9` | hover bg, badge |
| `brand-200` | `oklch(0.88 0.11 145)` | `#AEE6B9` | border aksen |
| `brand-300` | `oklch(0.81 0.15 145)` | `#82D592` | — |
| `brand-400` | `oklch(0.76 0.17 145)` | `#5ECB70` | — |
| **`brand-500`** | `oklch(0.71 0.18 145)` | **`#3CC152`** | **primary brand** |
| **`brand-600`** | `oklch(0.61 0.17 145)` | **`#2EA043`** | **warna tombol utama** |
| `brand-700` | `oklch(0.51 0.15 145)` | `#277E37` | hover tombol, teks brand |
| `brand-800` | `oklch(0.41 0.12 145)` | `#21632C` | — |
| `brand-900` | `oklch(0.31 0.09 145)` | `#1A4A23` | teks gelap brand |
| `brand-950` | `oklch(0.21 0.06 145)` | `#123018` | — |

> Brand re-skinnable: ganti angka hue `145` ke nilai lain (mis. `25` = orange) menggeser seluruh skala.

### Warna netral & status
- **Netral** (hue 250, sedikit cool): `neutral-0` putih → `neutral-950` hampir hitam. Teks badan: `neutral-600/700`; heading: `neutral-900`; border: `neutral-200`; bg halaman: `neutral-50`.
- **Status**: success `oklch(0.65 0.17 145)` (≈`#36B24A`), warning `oklch(0.78 0.15 75)` (≈`#E0A813` amber), danger `oklch(0.60 0.20 25)` (≈`#E23D2E` merah), info `oklch(0.65 0.14 230)` (≈`#3B9BE0` biru).

### Tipografi
- **Font utama (sans & display): `Plus Jakarta Sans`** (Google Font, variable) → fallback `system-ui, -apple-system, sans-serif`.
- **Mono: `JetBrains Mono`** → fallback `ui-monospace, monospace` (nomor, kode, WhatsApp).
- Heading pakai `font-display` (= Plus Jakarta Sans) dengan `font-semibold`/`font-bold` + `tracking-tight`.

### Skala font (Tailwind default — yang dipakai di app)
| Class | Size | Line-height | Pemakaian umum |
|---|---|---|---|
| `text-xs` | 0.75rem / 12px | 1rem | label, meta, badge |
| `text-sm` | 0.875rem / 14px | 1.25rem | teks badan, tabel |
| `text-base` | 1rem / 16px | 1.5rem | paragraf |
| `text-lg` | 1.125rem / 18px | 1.75rem | sub-judul kartu |
| `text-xl` | 1.25rem / 20px | 1.75rem | judul section kecil |
| `text-2xl` | 1.5rem / 24px | 2rem | judul halaman (mobile) |
| `text-3xl` | 1.875rem / 30px | 2.25rem | angka stat, judul section |
| `text-4xl` | 2.25rem / 36px | 2.5rem | heading marketing |
| `text-5xl` | 3rem / 48px | 1 | hero (sm+) |
| `text-6xl` | 3.75rem / 60px | 1 | hero (lg+) |

Pola tipografi kunci:
- **Heading**: `font-display text-3xl/4xl font-semibold tracking-tight text-neutral-900`
- **Body**: `text-sm/base text-neutral-600`
- **Label form**: `text-xs font-medium text-neutral-600`
- **Angka/stat**: `font-display text-3xl font-semibold tabular-nums`

### Radius & shadow
- Radius: `sm 0.375rem`, `md 0.5rem`, `lg 0.75rem`, `xl 1rem`, `2xl 1.5rem`. Kartu umumnya `rounded-xl/2xl`.
- Shadow: `soft` (subtle), `card` (default kartu), `elevated` (hover), `popout` (modal/emphasis).

---

## 2. Fitur SellOn (saat ini)

### Storefront & jualan
- Katalog publik per-toko dengan **9 layout** (grid, list, showcase, compact, magazine, feed, kiosk, katalog, poster)
- **Varian produk** (ukuran/warna) + **opsi/modifier** (dengan delta harga)
- **Produk digital** (link download otomatis ke email pembeli)
- **Bulk upload** produk via XLSX (async + progress SSE)
- **Promo & kode diskon** (min. belanja, batas pakai, periode, gratis ongkir)
- Keranjang pembeli + **checkout multi-langkah** (Identitas → Pengiriman → Pembayaran → Review)
- **Custom field checkout** (seller atur sendiri: email wajib/opsional/sembunyikan + tambah field teks/paragraf/dropdown/angka/tanggal/centang di langkah Identitas/Pengiriman)
- **Ongkir live** via RajaOngkir (Komerce) — pilih kurir di checkout, hitung otomatis per kota, gratis ongkir threshold
- **Pembayaran**: Midtrans (akun seller sendiri — QRIS/transfer/e-wallet), transfer manual + QRIS statis

### Kasir POS
- Kasir **offline & online**, keranjang cepat + hitung kembalian
- **Struk** (Bluetooth thermal atau browser; atur lebar/header/footer/auto-print)
- **Shift kasir** + **laporan POS**

### F&B / Dine-in
- **Pesan via QR meja** (`/t/{token}`) — pembeli scan, pilih dine-in/take away, pesan sendiri (dengan **variant picker**)
- **Kitchen Display (KDS)** — pesanan tampil di layar dapur + **nomor antrian**
- **Layar antrian pelanggan** publik (`/q/{slug}`) untuk TV/tablet
- **Custom layout kartu QR meja** (template Klasik/Tent/Poster + warna + headline + teks)

### Pelanggan & loyalitas
- **Database pelanggan** otomatis (riwayat order & total belanja; penanda **Blacklist**)
- **Membership tier** (mis. Silver/Gold/Platinum) — naik otomatis berdasarkan total belanja, kasih **bonus poin (multiplier)** + **diskon member** di kasir
- **Poin loyalty** + **kartu member ber-QR**

### Inventory / operasional
- **Bahan baku & stok** dengan **resep (BOM)** — stok berkurang otomatis tiap produk terjual
- **Pembelian (PO)** ke supplier + terima barang
- **Stok opname** (hitung fisik) + peringatan stok menipis

### Lainnya
- **Program Reseller / Dropship** (supplier ↔ reseller)
- **Laporan penjualan + Analisa AI** + analytics overview + catatan kas
- **Multi-staf dengan role** + **audit log**
- **Custom domain** + **tema warna brand**
- **Manajemen pesanan** (status, resi, kirim WA, catatan, bukti bayar)

### Notifikasi
- **WhatsApp** via Twilio (alert pesanan ke seller) — *catatan: saat ini masih sandbox; edit template seller sementara dimatikan, pakai default*
- **Email** transaksional via Mailtrap (welcome, status order, notifikasi bayar, fulfillment digital)
- **WA manual** via link `wa.me` (konfirmasi/bayar/kirim — pakai template yang bisa di-prefill)

### Platform admin (`/platform/*`)
- Kelola users (impersonate/ban/hard-delete), toko, harga paket, approval invoice langganan, audit
- **Banner dashboard** — admin upload banner promo → tampil sebagai slider di dashboard semua seller (drag-reorder)

### Plan & model bisnis
- **Free** / **Pro (Rp99k/bln)** / **Bisnis (Rp299k/bln)** — mayoritas fitur power terbuka di Pro; Bisnis menaikkan kuota (staf, order/bulan)
- **Biaya flat per bulan, bukan potongan per transaksi** (vs marketplace 5–12%)

---

## 3. Tone & positioning
- Audience: **UMKM / seller WhatsApp Indonesia**. Bahasa santai-profesional, "kamu", istilah lokal (toko, kasir, ongkir, juragan).
- Value: **toko online sendiri tanpa ribet + tanpa potongan per transaksi**, all-in-one (jualan online + POS + dapur/KDS + inventory + loyalty).
