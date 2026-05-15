# Bug Fix Plan — SellOn

**Tanggal:** 2026-05-15  
**Branch target:** `main`  
**Dikerjakan oleh:** Bug Engineer

---

## Konteks Proyek

**SellOn** adalah WhatsApp-commerce SaaS untuk UMKM Indonesia. Monorepo:
- Backend: Go 1.25 di `api/` (chi router, pgx/pgxpool, golang-jwt)
- Frontend: Next.js 16 App Router di `web/src/` (TypeScript, Tailwind v4)
- Local dev: `make dev` → Docker Compose (api + web + postgres + redis)

UI copy: Bahasa Indonesia. Code comments dan commits: English.

---

## Aturan Umum

1. **Satu commit per bug.** Format: `fix(scope): BUG-NNN — deskripsi singkat`
2. Jangan refactor kode di luar scope bug.
3. Untuk perubahan Go: build check dengan `cd api && go build -o /tmp/sellon-api ./cmd/server && rm /tmp/sellon-api`
4. Untuk perubahan frontend: type check dengan `cd web && pnpm exec tsc --noEmit`
5. Hot-reload aktif di container (`air` untuk Go, Next.js dev untuk web) — test langsung setelah save.

---

## Bug List

---

### BUG-028 · Switch kurir tanpa accessible label

**Severity:** Medium  
**File:** `web/src/components/dashboard/pengiriman-form.tsx`

**Problem:**  
Setiap baris kurir (JNE, J&T, GoSend, dll.) punya `<Switch>` toggle tanpa label yang linked secara semantis. Teks nama kurir ada di `<p>` sibling, tapi tidak dihubungkan via `aria-label` / `aria-labelledby`. Screen reader membacanya sebagai "switch" tanpa konteks.

**Lokasi kode:**
```tsx
// Baris ~200-204
<Switch
  size="sm"
  checked={active}
  onChange={(e) => toggle(c.code, e.target.checked)}
/>
```

**Fix:**  
Tambah `aria-label` ke tiap Switch:
```tsx
<Switch
  size="sm"
  checked={active}
  onChange={(e) => toggle(c.code, e.target.checked)}
  aria-label={`Aktifkan kurir ${c.label}`}
/>
```

**Verifikasi:** Inspect elemen Switch di DevTools, pastikan `aria-label` tampil di Accessibility panel.

---

### BUG-029 · `enabled_couriers` tersimpan sebagai `{}` saat semua kurir dipilih

**Severity:** High  
**Files:**
- `web/src/components/dashboard/pengiriman-form.tsx` (baris 53–56, 78–79)
- `api/internal/handler/store.go` (baris 61–64, 330–345)

**Problem:**  
Desain yang ada: saat **semua** kurir dicentang, frontend mengirim `enabled_couriers: []` (array kosong = "semua aktif"), bukan mengirim semua 8 kode. Backend menerima `[]`, clean-list jadi `[]`, dan menyimpan `'{}'::TEXT[]` di Postgres. Saat halaman reload, API mengembalikan `[]` (atau `null` → dikonversi ke `[]` oleh DTO). Frontend membaca `list.length === 0` → menampilkan semua Switch dalam posisi ON. Sejauh ini benar.

**Root cause yang perlu diverifikasi:**  
Jalankan ini untuk cek kondisi aktual di DB:
```sql
SELECT slug, enabled_couriers FROM stores LIMIT 5;
```

Jika hasilnya `{}` (Postgres empty array) dan frontend menampilkan semua kurir sebagai OFF setelah save, masalahnya ada di bagian ini:

```typescript
// pengiriman-form.tsx baris 53-56
const list = initial.enabled_couriers ?? [];
if (list.length === 0) return new Set(couriers.map((c) => c.code));
return new Set(list);
```

Jika `initial.enabled_couriers` datang sebagai `null` (bukan `[]`), maka `?? []` memperbaikinya. Tapi jika datang sebagai `{}` (object, bukan array), maka `list.length` adalah `undefined` yang truthy tapi `=== 0` adalah false → masuk ke `return new Set(list)` dengan object, bukan array → semua kurir OFF.

**Fix:**  
Di handler DTO (`api/internal/handler/store.go` baris 61–64), pastikan couriers selalu array (sudah ada). Tambahkan guard di frontend juga:
```typescript
// pengiriman-form.tsx baris 53-56
const list = Array.isArray(initial.enabled_couriers) ? initial.enabled_couriers : [];
if (list.length === 0) return new Set(couriers.map((c) => c.code));
return new Set(list);
```

**Verifikasi:**
1. Buka Pengaturan Pengiriman
2. Centang semua 8 kurir → Save
3. Reload halaman
4. Semua 8 kurir harus tetap dalam posisi ON

---

### BUG-030 · `shipping_origin_city_name` tetap kosong setelah save

**Severity:** Medium  
**Files:**
- `web/src/components/dashboard/pengiriman-form.tsx` (baris 44–49, 126–129)
- `api/internal/handler/store.go` (handler `UpdateShipping`)

**Problem:**  
Saat user pertama kali membuka form Pengiriman dan store sudah punya `shipping_origin_city_id` (hasil save lama sebelum field `shipping_origin_city_name` ada), state `originCityName` diinisialisasi dari `initial.shipping_origin_city_name ?? ""` yang kosong. Jika user tidak re-pilih kota dari CityPicker dan langsung Save, `shipping_origin_city_name: ""` dikirim ke backend dan tersimpan kosong.

Akibatnya: RajaOngkir ID ada tapi nama kota kosong → UI checkout menampilkan kota origin tidak jelas.

**Lokasi kode:**
```typescript
// baris 44-48
const [originCityID, setOriginCityID] = useState(initial.shipping_origin_city_id ?? "");
const [originCityName, setOriginCityName] = useState(
  initial.shipping_origin_city_name ?? "",  // ← bisa kosong
);
```

**Fix (pilih salah satu):**

**Opsi A — Frontend: fetch city name saat ID ada tapi name kosong**
```typescript
// Tambah useEffect di PengirimanForm
useEffect(() => {
  if (originCityID && !originCityName) {
    fetch(`${apiBase}/api/v1/cities/search?q=${originCityID}&by_id=true`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        const city = data.cities?.[0];
        if (city) setOriginCityName(city.city_name);
      })
      .catch(() => {});
  }
}, [originCityID]);
```

**Opsi B — Backend: derive name dari city_id saat name kosong**  
Di `api/internal/handler/store.go`, sebelum menyimpan, jika `req.ShippingOriginCityID != ""` dan `req.ShippingOriginCityName == ""`, lakukan lookup ke tabel/cache kota dan isi name-nya.

**Opsi C (termudah) — Backend: fallback ke shipping_origin_city (plain text)**  
Jika `shipping_origin_city_name` kosong tapi `shipping_origin_city` (plain text field) ada, gunakan itu sebagai display name.

**Rekomendasi:** Opsi C paling safe dan tidak butuh API call tambahan. Implementasi di DTO:
```go
// api/internal/handler/store.go, toStoreDTO
cityName := s.ShippingOriginCityName
if cityName == "" {
    cityName = s.ShippingOriginCity // fallback ke plain text
}
// ...
ShippingOriginCityName: cityName,
```

**Verifikasi:**
1. Store dengan `city_id` tapi nama kosong → reload Pengaturan Pengiriman
2. CityPicker harus menampilkan nama kota yang benar
3. Save tanpa re-pilih kota → nama tetap tersimpan

---

### BUG-031 · "Kirim Link Pembayaran" WA button mengirim "(belum tersedia)"

**Severity:** High  
**File:** `web/src/components/dashboard/order-quick-wa.tsx`

**Problem:**  
Tombol "Kirim Link Pembayaran" diaktifkan berdasarkan kondisi:
```typescript
// baris 129
const canSendPayment = order.payment_status !== "paid" && order.status !== "cancelled";
```

Kondisi ini TIDAK mengecek apakah `order.payment_url` sudah ada. Saat seller klik tombol sebelum generate payment link (via Midtrans), template WA dikirim dengan:
```typescript
// baris 88
link_pembayaran: order.payment_url || "(belum tersedia)",
```

Pembeli menerima WA: "Silakan bayar di: (belum tersedia)" — merusak pengalaman pembeli.

**Fix:**  
Ubah kondisi `canSendPayment` dan tambahkan tooltip/hint:
```typescript
// baris 129 — ubah kondisi
const hasPaymentUrl = !!order.payment_url;
const canSendPayment = hasPaymentUrl && order.payment_status !== "paid" && order.status !== "cancelled";
```

Dan tambahkan hint di bawah tombol saat `!hasPaymentUrl`:
```tsx
{/* Tambahkan di bawah button "Kirim Link Pembayaran" */}
{!hasPaymentUrl && order.payment_status !== "paid" && (
  <p className="text-xs text-neutral-500">
    Generate payment link dulu via tombol &ldquo;Buat Link Pembayaran&rdquo; di atas.
  </p>
)}
```

**Verifikasi:**
1. Buka order detail yang belum punya payment_url
2. Tombol "Kirim Link Pembayaran" harus disabled (abu-abu)
3. Ada hint teks di bawahnya
4. Setelah generate payment link → tombol aktif kembali
5. Klik → WA terbuka dengan URL yang valid (bukan "(belum tersedia)")

---

### BUG-033 · Suffix duplicate produk "(Copy)" — seharusnya "(Salinan)"

**Severity:** Low  
**File:** `api/internal/handler/product.go`

**Problem:**  
Komentar di baris 652 sudah menyebutkan suffix yang benar: `// Name suffix: " (Salinan)"`. Tapi implementasinya masih English:

```go
// baris 701
Name: src.Name + " (Copy)",
```

Juga slug suffix masih `-copy`:
```go
// baris 688
newSlug = src.Slug + "-copy-" + strconv.Itoa(n)
```

**Fix:**
```go
// baris 701
Name: src.Name + " (Salinan)",

// baris 688
newSlug = src.Slug + "-salinan-" + strconv.Itoa(n)
```

Dan slug probe sebelumnya (baris ~670-690) yang mencari existing slug `-salinan` juga perlu disesuaikan jika ada pattern matching terhadap `-copy`.

**Verifikasi:**
1. Buka daftar produk → klik duplicate pada satu produk
2. Produk baru harus bernama `[nama asli] (Salinan)` — bukan `(Copy)`
3. Slug produk baru harus `[slug-asli]-salinan` (atau `-salinan-2` jika sudah ada)

---

### ISSUE-010 · Badge "Tutup Sekarang" muncul saat `show_hours_public=false`

**Severity:** Medium  
**File:** `web/src/app/[slug]/page.tsx`

**Problem:**  
`showHours` flag (baris 145) sudah digunakan untuk menyembunyikan detail jam buka (baris 215, 221, 266). Tapi badge status di baris 184–190 TIDAK dibungkus kondisi `showHours`:

```tsx
// baris 184-190 — tanpa guard showHours
{!store.is_open ? (
  <Badge variant="warning">Toko Tutup</Badge>
) : openNow ? (
  <Badge variant="success">Buka Sekarang</Badge>
) : (
  <Badge variant="warning">Tutup Sekarang</Badge>
)}
```

Akibatnya: seller yang mematikan `show_hours_public` tetap memperlihatkan status real-time jam buka/tutup ke pembeli — yang mungkin tidak diinginkan (misal: toko yang tidak mau membatasi jam pemesanan online).

**Catatan penting:** Badge "Toko Tutup" (`!store.is_open`) adalah status permanen yang berbeda dari status jam real-time. Pertimbangkan untuk mempertahankan "Toko Tutup" bahkan saat `show_hours_public=false`, karena ini informs pembeli bahwa toko sedang offline total — bukan hanya soal jam.

**Fix (recommended):**  
Hanya sembunyikan badge jam real-time ("Buka Sekarang" / "Tutup Sekarang") saat `show_hours_public=false`, tapi tetap tampilkan "Toko Tutup" saat toko memang offline:

```tsx
// Ganti baris 184-190
{!store.is_open ? (
  <Badge variant="warning">Toko Tutup</Badge>
) : showHours ? (
  openNow ? (
    <Badge variant="success">Buka Sekarang</Badge>
  ) : (
    <Badge variant="warning">Tutup Sekarang</Badge>
  )
) : null}
```

**Verifikasi:**
1. Di Pengaturan Storefront, matikan "Tampilkan jam buka ke publik"
2. Buka storefront publik `/{slug}`
3. Jika toko `is_open=true` → TIDAK ada badge jam sama sekali
4. Jika toko `is_open=false` → masih ada badge "Toko Tutup"

---

## Urutan Prioritas Pengerjaan

| Urutan | Bug | Alasan |
|--------|-----|--------|
| 1 | **BUG-031** | Pembeli bisa menerima WA dengan "(belum tersedia)" — customer-facing, merusak trust |
| 2 | **BUG-029** | Setting kurir tidak persisten = salah satu fitur inti tidak jalan |
| 3 | **ISSUE-010** | Setting privasi seller tidak dihormati di storefront publik |
| 4 | **BUG-030** | City name kosong = RajaOngkir tidak terkonfigurasi dengan benar |
| 5 | **BUG-028** | Accessibility — tidak blokir fungsionalitas tapi penting untuk a11y |
| 6 | **BUG-033** | Copy inconsistency — low impact, quick fix |

---

## Cara Verifikasi Setelah Semua Bug Selesai

```bash
# Build check backend
cd api && go build -o /tmp/sellon-api ./cmd/server && rm /tmp/sellon-api

# Type check frontend
cd web && pnpm exec tsc --noEmit

# Jalankan dev environment
make dev
```

Test manual di `http://localhost:3100` dengan akun seller (bukan admin).
