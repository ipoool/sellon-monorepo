// Static help center registry. Each category has a small set of articles
// rendered as plain JSX inside src/app/bantuan/[slug]/page.tsx. Keeping
// content here as data (not MDX) so changes are quick and the build stays
// dependency-free.

export type HelpArticle = {
  slug: string;
  category: HelpCategorySlug;
  title: string;
  excerpt: string;
  // Rendered as a list of paragraphs / numbered lists by the article page.
  // Empty array = paragraph; arrays render as <ol>.
  body: HelpBlock[];
  readingTime: string;
};

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ol"; items: string[] }
  | { type: "ul"; items: string[] }
  | { type: "callout"; tone: "info" | "warning"; text: string };

export type HelpCategorySlug =
  | "memulai"
  | "produk-katalog"
  | "pesanan"
  | "pembayaran"
  | "akun-pengaturan"
  | "berlangganan";

export type HelpCategory = {
  slug: HelpCategorySlug;
  title: string;
};

export const helpCategories: HelpCategory[] = [
  { slug: "memulai", title: "Memulai" },
  { slug: "produk-katalog", title: "Produk & Katalog" },
  { slug: "pesanan", title: "Pesanan" },
  { slug: "pembayaran", title: "Pembayaran" },
  { slug: "akun-pengaturan", title: "Akun & Pengaturan" },
  { slug: "berlangganan", title: "Berlangganan" },
];

export const helpArticles: HelpArticle[] = [
  // === MEMULAI ===
  {
    slug: "cara-daftar-akun-sellon",
    category: "memulai",
    title: "Cara daftar akun SellOn",
    excerpt:
      "Login pakai akun Google Anda — tidak perlu isi formulir panjang.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Mendaftar SellOn dirancang sesimpel mungkin. Anda tidak perlu mengisi formulir, mengunggah KTP, atau menunggu verifikasi. Cukup login menggunakan akun Google.",
      },
      { type: "h2", text: "Langkah pendaftaran" },
      {
        type: "ol",
        items: [
          "Buka halaman /masuk dari mana saja di sellon.id.",
          "Klik tombol 'Lanjut dengan Google'.",
          "Pilih akun Google yang ingin Anda pakai untuk toko.",
          "Setelah login, Anda akan diarahkan ke setup wizard untuk membuat toko pertama.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Akun yang Anda pilih akan menjadi pemilik toko. Pilih akun yang Anda kontrol penuh — login Google ini juga jadi cara Anda masuk lagi nanti.",
      },
      {
        type: "p",
        text:
          "Setelah pendaftaran, Anda hanya perlu setup nama toko, slug (alamat publik), kategori, dan kota. Setup wizard butuh sekitar 1 menit.",
      },
    ],
  },
  {
    slug: "setup-toko-pertama-5-menit",
    category: "memulai",
    title: "Setup toko pertamamu dalam 5 menit",
    excerpt:
      "Dari login Google sampai katalog publik siap dibagikan ke pelanggan.",
    readingTime: "5 menit",
    body: [
      {
        type: "p",
        text:
          "Setelah daftar dengan Google, ada 4 langkah untuk membuat toko siap menerima pesanan.",
      },
      { type: "h2", text: "1. Setup wizard" },
      {
        type: "p",
        text:
          "Anda akan diarahkan otomatis ke /setup. Isi nama toko, slug (mis. warung-bu-sari → halaman publik di sellon.id/warung-bu-sari), kategori produk, dan kota. Slug bisa diubah nanti.",
      },
      { type: "h2", text: "2. Tambah produk pertama" },
      {
        type: "p",
        text:
          "Buka Dasbor → Produk → Tambah Produk. Isi nama, harga, stok, dan unggah minimal 1 foto. Untuk produk dengan ukuran/varian, aktifkan Varian dan tambah baris (S, M, L atau Merah, Biru).",
      },
      { type: "h2", text: "3. Atur jam buka & profil" },
      {
        type: "p",
        text:
          "Pengaturan → Profil Toko: lengkapi deskripsi, nomor WhatsApp, jam buka per hari. Toggle 'Toko buka' menjadi penentu apakah pembeli bisa order saat ini.",
      },
      { type: "h2", text: "4. Bagikan link toko" },
      {
        type: "p",
        text:
          "Salin URL halaman toko Anda (sellon.id/{slug}) dan tempel di bio Instagram, status WhatsApp, atau kirim langsung ke grup pelanggan.",
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Anda bisa menerima pesanan COD/transfer manual sebelum mengaktifkan Midtrans — pembeli akan diarahkan ke halaman pembayaran dengan rekening yang Anda atur.",
      },
    ],
  },
  {
    slug: "hubungkan-akun-midtrans",
    category: "memulai",
    title: "Cara menghubungkan akun Midtrans",
    excerpt:
      "BYO (bring-your-own) Midtrans — dana langsung masuk ke rekening Anda.",
    readingTime: "4 menit",
    body: [
      {
        type: "p",
        text:
          "SellOn pakai model facilitator: setiap penjual pakai akun Midtrans-nya sendiri. Artinya dana hasil penjualan langsung masuk ke rekening Anda sesuai jadwal settlement Midtrans, tanpa lewat kami.",
      },
      { type: "h2", text: "Yang perlu disiapkan" },
      {
        type: "ul",
        items: [
          "Akun Midtrans (sandbox dulu untuk testing, lalu production saat siap live).",
          "Server Key dan Client Key dari dashboard Midtrans → Settings → Access Keys.",
        ],
      },
      { type: "h2", text: "Langkah koneksi" },
      {
        type: "ol",
        items: [
          "Buka Dasbor → Pengaturan → Pembayaran.",
          "Pilih mode (Sandbox / Production) sesuai key yang Anda punya.",
          "Tempel Server Key di field 'Server Key'. Server Key disimpan terenkripsi (AES-GCM).",
          "Tempel Client Key di field opsional bila ingin pakai Snap inline.",
          "Pilih metode pembayaran (QRIS, VA, GoPay, ShopeePay, Kartu Kredit) sesuai yang sudah di-enable di dashboard Midtrans.",
          "Klik Simpan, lalu klik 'Tes Koneksi' untuk verifikasi.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        text:
          "Saat pindah dari Sandbox ke Production, akan muncul dialog konfirmasi. Pastikan key production Anda valid sebelum pindah, karena pesanan production akan langsung memproses uang asli.",
      },
      {
        type: "p",
        text:
          "URL webhook akan otomatis dibuatkan setelah Anda menyimpan key pertama kali. Salin URL itu dan tempel di Midtrans dashboard → Settings → Configuration → Notification URL.",
      },
    ],
  },
  {
    slug: "buat-link-katalog-whatsapp",
    category: "memulai",
    title: "Membuat link katalog WhatsApp",
    excerpt:
      "Halaman publik toko Anda yang siap di-share ke grup atau bio Instagram.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "Setiap toko di SellOn otomatis dapat halaman publik di sellon.id/{slug-toko}. Tidak perlu setup tambahan — begitu toko dibuat, link sudah aktif.",
      },
      { type: "h2", text: "Format link" },
      {
        type: "p",
        text:
          "Halaman utama toko: sellon.id/{slug}. Halaman produk individual: sellon.id/{slug}/produk/{slug-produk}. Halaman pembayaran pesanan: sellon.id/{slug}/pesanan/{nomor-pesanan} (otomatis dikirim ke pembeli).",
      },
      { type: "h2", text: "Cara membagikan" },
      {
        type: "ul",
        items: [
          "Bio Instagram / TikTok — tempel link toko utama.",
          "Status WhatsApp — kombinasi link + foto produk featured.",
          "Tombol 'Bagikan' di tiap halaman produk → buka share sheet WA.",
          "Pengaturan → Profil Toko: aktifkan Banner & Tagline supaya tampilan publik lebih menarik.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Tampilkan toko di mode 'Buka' supaya pembeli bisa langsung order. Saat tutup, halaman tetap bisa dibrowse tapi tombol 'Pesan' jadi non-aktif.",
      },
    ],
  },

  // === PRODUK & KATALOG ===
  {
    slug: "upload-produk-foto-bagus",
    category: "produk-katalog",
    title: "Upload produk dengan foto bagus",
    excerpt:
      "Foto bisa langsung di-upload dari device. Maks 5 foto per produk, 5 MB tiap file.",
    readingTime: "3 menit",
    body: [
      { type: "h2", text: "Cara upload" },
      {
        type: "ol",
        items: [
          "Dasbor → Produk → Tambah Produk.",
          "Scroll ke bagian 'Foto Produk', klik tombol 'Upload Foto'.",
          "Pilih satu atau beberapa file sekaligus (JPG/PNG/WebP).",
          "Foto otomatis di-upload ke storage SellOn dan muncul sebagai thumbnail.",
          "Klik X di pojok thumbnail untuk hapus foto yang salah.",
        ],
      },
      { type: "h2", text: "Tips foto produk" },
      {
        type: "ul",
        items: [
          "Pakai cahaya pagi (jam 8–10) atau sore (jam 4–5) — paling natural.",
          "Latar belakang polos: kain putih, kertas BC, atau dinding cat krem.",
          "Foto kotak (1:1) lebih konsisten karena katalog publik pakai aspect kotak.",
          "Foto pertama jadi thumbnail di katalog — pilih yang paling representatif.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Maks 5 foto per produk, masing-masing 5 MB. Tidak perlu kompres manual — Supabase Storage menyajikan ukuran adaptif lewat CDN.",
      },
    ],
  },
  {
    slug: "atur-stok-dan-varian",
    category: "produk-katalog",
    title: "Mengatur stok dan varian",
    excerpt:
      "Set stok per produk atau per varian. Low-stock alert otomatis muncul saat stok menipis.",
    readingTime: "4 menit",
    body: [
      { type: "h2", text: "Stok produk biasa" },
      {
        type: "p",
        text:
          "Tanpa varian: isi field 'Stok' di form produk. Setiap pesanan masuk tidak akan otomatis mengurangi stok di MVP — Anda perlu update manual setelah konfirmasi pesanan (rencana otomatisasi di roadmap).",
      },
      { type: "h2", text: "Stok per varian" },
      {
        type: "p",
        text:
          "Bila produk punya ukuran/warna berbeda, aktifkan toggle 'Pakai varian'. Setiap baris varian punya nama (S/M/L), harga sendiri, stok sendiri, dan SKU opsional.",
      },
      { type: "h2", text: "Low-stock alert" },
      {
        type: "p",
        text:
          "Set 'Low-stock threshold' — angka stok minimum yang masih oke. Saat stok ≤ threshold, badge kuning 'Stok Rendah' muncul di list produk dan dashboard. Default 0 (tidak tampil).",
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Stok 0 + status 'Aktif' → halaman publik tampilkan 'Stok habis' dan tombol pesan dimatikan. Untuk menyembunyikan total, ganti status ke 'Nonaktif'.",
      },
    ],
  },
  {
    slug: "tulis-deskripsi-yang-menjual",
    category: "produk-katalog",
    title: "Tips menulis deskripsi produk yang menjual",
    excerpt:
      "Deskripsi yang baik menjawab pertanyaan pembeli sebelum mereka bertanya.",
    readingTime: "4 menit",
    body: [
      {
        type: "p",
        text:
          "Deskripsi produk di SellOn mendukung multiline (cukup tekan Enter untuk paragraf baru). Maksimal beberapa ribu karakter — cukup untuk cerita produk yang lengkap.",
      },
      { type: "h2", text: "Struktur yang berhasil" },
      {
        type: "ol",
        items: [
          "Ringkasan 1 kalimat: apa produknya & siapa cocoknya.",
          "Detail spesifikasi: ukuran, bahan, berat, isi.",
          "Cara pakai / tips penyajian.",
          "Catatan stok / pre-order / shipping note bila ada.",
        ],
      },
      { type: "h2", text: "Yang perlu dihindari" },
      {
        type: "ul",
        items: [
          "Caps lock semua — terlihat seperti spam.",
          "Emoji berlebihan — 1–2 cukup untuk emphasis.",
          "Janji muluk tanpa bukti — pakai testimoni nyata bila ada.",
          "Copy-paste dari toko lain — Google + pembeli bisa baca.",
        ],
      },
    ],
  },
  {
    slug: "kategori-dan-tag",
    category: "produk-katalog",
    title: "Membuat kategori produk",
    excerpt:
      "Kategori bantu pembeli filter di halaman publik dan Anda mengelola produk.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Kategori adalah cara mengelompokkan produk. Di halaman publik, pembeli bisa filter pakai chip kategori; di dashboard, kategori jadi label per produk.",
      },
      { type: "h2", text: "Cara mengelola" },
      {
        type: "ol",
        items: [
          "Dasbor → Pengaturan → Kategori.",
          "Klik 'Tambah' lalu isi nama kategori (mis. Kopi, Sambal, Snack).",
          "Tambah produk → di field 'Kategori', pilih kategori dari dropdown.",
          "Edit / hapus kategori dari halaman yang sama. Hapus tidak menghapus produk-nya, hanya melepas relasi.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Kategori muncul di halaman publik hanya bila ada minimal satu produk aktif di dalamnya.",
      },
    ],
  },

  // === PESANAN ===
  {
    slug: "konfirmasi-dan-proses-pesanan",
    category: "pesanan",
    title: "Konfirmasi dan proses pesanan",
    excerpt:
      "Status pesanan di SellOn: pending → dikonfirmasi → diproses → dikirim → selesai.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "Setiap pesanan masuk masuk ke status 'pending'. Anda perlu konfirmasi (atau cancel) lalu memproses dan mengirim.",
      },
      { type: "h2", text: "Alur status" },
      {
        type: "ol",
        items: [
          "Pending — pembeli baru saja submit.",
          "Dikonfirmasi — Anda sudah cek stok & siap proses.",
          "Diproses — paket sedang dikemas.",
          "Dikirim — input nomor resi & pilih kurir.",
          "Selesai — pembeli menerima.",
        ],
      },
      { type: "h2", text: "Cara update" },
      {
        type: "p",
        text:
          "Buka Dasbor → Pesanan → klik nomor pesanan. Tombol aksi muncul sesuai status saat ini. Setiap perubahan status otomatis kirim notifikasi WhatsApp ke pembeli (sesuai template di Pengaturan → WhatsApp).",
      },
    ],
  },
  {
    slug: "kirim-resi-ke-pembeli",
    category: "pesanan",
    title: "Mengirim resi ke pembeli",
    excerpt:
      "Input nomor resi saat status berubah ke 'Dikirim' — pembeli langsung tahu.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Saat Anda klik tombol 'Kirim Pesanan' di halaman detail pesanan, dialog akan minta tiga input: nama kurir, layanan (REG/YES), dan nomor resi.",
      },
      { type: "h2", text: "Yang perlu diisi" },
      {
        type: "ul",
        items: [
          "Kurir: JNE / J&T / SiCepat / AnterAja / GoSend / GrabExpress (atau ketik manual).",
          "Layanan: REG, YES, EZ, Same Day — tergantung kurir.",
          "Nomor resi: paste dari struk kurir.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Nomor resi muncul di halaman pembayaran pembeli dan template WhatsApp 'order_shipped'. Pembeli bisa cek status pengiriman langsung di website kurir.",
      },
    ],
  },
  {
    slug: "batalkan-dan-refund-pesanan",
    category: "pesanan",
    title: "Membatalkan dan refund pesanan",
    excerpt:
      "Cancel pesanan kapan saja sebelum 'selesai'. Refund pembayaran lewat dashboard Midtrans.",
    readingTime: "3 menit",
    body: [
      { type: "h2", text: "Cara cancel" },
      {
        type: "p",
        text:
          "Halaman detail pesanan → klik 'Batalkan'. Anda akan diminta menulis alasan (opsional tapi disarankan untuk audit). Status berubah ke 'Cancelled' dan pembeli dapat notifikasi WA.",
      },
      { type: "h2", text: "Refund pembayaran" },
      {
        type: "p",
        text:
          "Untuk pesanan yang sudah dibayar (status pembayaran = 'paid'): Anda perlu refund manual via dashboard Midtrans. SellOn tidak otomatis trigger refund karena pembayaran tidak lewat akun kami.",
      },
      {
        type: "ol",
        items: [
          "Buka dashboard.midtrans.com (atau dashboard.sandbox.midtrans.com untuk testing).",
          "Pilih transaksi → Refund.",
          "Refund akan diproses sesuai metode pembayaran asal (1–7 hari kerja).",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        text:
          "Untuk pembayaran transfer manual, refund dilakukan sendiri oleh Anda ke rekening pembeli — sertakan bukti transfer untuk dokumentasi.",
      },
    ],
  },
  {
    slug: "retur-dan-komplain",
    category: "pesanan",
    title: "Mengelola retur dan komplain",
    excerpt:
      "Catat retur lewat seller notes, lalu cancel + refund di Midtrans bila perlu.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "MVP belum punya alur retur otomatis. Strategi yang direkomendasikan: pakai 'Catatan Internal' di halaman detail pesanan untuk mencatat alasan retur, lalu update status ke 'Cancelled' bila barang sudah kembali ke Anda.",
      },
      { type: "h2", text: "Best practice" },
      {
        type: "ul",
        items: [
          "Tetapkan policy retur di halaman publik (mis. di tagline atau deskripsi produk).",
          "Untuk komplain via WA, simpan screenshot di Catatan Internal supaya audit trail jelas.",
          "Setelah retur diterima, refund via Midtrans (lihat artikel 'Membatalkan dan refund pesanan').",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Alur retur formal akan ditambahkan setelah MVP. Untuk sekarang, dokumentasi manual via catatan internal sudah cukup.",
      },
    ],
  },

  // === PEMBAYARAN ===
  {
    slug: "cara-kerja-qris-di-sellon",
    category: "pembayaran",
    title: "Cara kerja QRIS di SellOn",
    excerpt:
      "QRIS dinamis lewat Midtrans Snap, atau QRIS statis (foto QR) untuk yang baru mulai.",
    readingTime: "4 menit",
    body: [
      { type: "h2", text: "Dua mode QRIS" },
      {
        type: "p",
        text:
          "SellOn mendukung dua jenis QRIS: dinamis (Midtrans Snap) dan statis (foto QR yang Anda upload).",
      },
      { type: "h2", text: "QRIS dinamis (Midtrans)" },
      {
        type: "ul",
        items: [
          "Otomatis membuat QR berbeda per pesanan, dengan nominal sudah diset.",
          "Status pembayaran update real-time via webhook (jadi 'Lunas' otomatis saat pembeli bayar).",
          "Butuh akun Midtrans + QRIS sudah di-enable di dashboard Midtrans-nya.",
        ],
      },
      { type: "h2", text: "QRIS statis (manual)" },
      {
        type: "ul",
        items: [
          "Upload foto QR Anda di Pengaturan → Pembayaran → Rekening Manual & QRIS Statis.",
          "Pembeli scan QR yang sama untuk semua pesanan, lalu klik 'Saya sudah bayar' di halaman pembayaran.",
          "Anda perlu konfirmasi manual via dashboard.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Untuk skala kecil (<50 transaksi/bulan), QRIS statis cukup. Untuk volume lebih tinggi, dinamis lebih hemat waktu dan minim error nominal.",
      },
    ],
  },
  {
    slug: "settlement-dan-jadwal-pencairan",
    category: "pembayaran",
    title: "Settlement dan jadwal pencairan",
    excerpt:
      "Dana pembeli langsung masuk ke rekening Anda sesuai jadwal Midtrans — bukan ke kami.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "Karena SellOn pakai model facilitator (BYO Midtrans), dana settlement diatur sepenuhnya oleh Midtrans dan masuk ke rekening yang Anda daftarkan di dashboard Midtrans Anda.",
      },
      { type: "h2", text: "Jadwal default Midtrans" },
      {
        type: "ul",
        items: [
          "QRIS, GoPay, ShopeePay: settle hari kerja berikutnya (T+1).",
          "Virtual Account (BCA, Mandiri, BNI, dll.): T+1 atau T+2 tergantung bank.",
          "Kartu Kredit: T+3 sampai T+7.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Jadwal pasti tergantung tier akun Midtrans Anda dan hari libur. Cek 'Settlement Schedule' di dashboard Midtrans Anda untuk angka resmi.",
      },
      { type: "h2", text: "Untuk transfer manual" },
      {
        type: "p",
        text:
          "Pembeli transfer langsung ke rekening yang Anda set di Pengaturan → Pembayaran → Rekening Manual. Tidak ada settlement delay — dana masuk segera setelah pembeli transfer.",
      },
    ],
  },
  {
    slug: "memahami-fee-qris",
    category: "pembayaran",
    title: "Memahami fee QRIS",
    excerpt:
      "Fee QRIS standar = 0,7% per transaksi (regulasi BI). Tidak ada biaya tambahan dari SellOn.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Berdasarkan regulasi Bank Indonesia, fee QRIS untuk merchant adalah 0,7% per transaksi (per Mei 2025). Fee ini dipotong oleh Midtrans, bukan oleh SellOn.",
      },
      { type: "h2", text: "Contoh perhitungan" },
      {
        type: "p",
        text:
          "Pembeli bayar Rp 100.000 → Midtrans potong 0,7% (Rp 700) → settlement masuk ke rekening Anda Rp 99.300.",
      },
      {
        type: "callout",
        tone: "info",
        text:
          "SellOn tidak mengambil fee per transaksi — hanya biaya bulanan tetap untuk akses platform. Semua fee QRIS langsung dipotong di sisi Midtrans.",
      },
      { type: "h2", text: "Metode lain" },
      {
        type: "ul",
        items: [
          "Virtual Account: fee flat Rp 4.000 per transaksi (tergantung bank).",
          "GoPay/ShopeePay: 2% per transaksi.",
          "Kartu Kredit: 2,9% + Rp 2.000 per transaksi.",
        ],
      },
    ],
  },
  {
    slug: "mengubah-rekening-tujuan",
    category: "pembayaran",
    title: "Mengubah rekening tujuan",
    excerpt:
      "Rekening tujuan diatur di dashboard Midtrans Anda — bukan di SellOn.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Karena SellOn tidak menyimpan dana Anda, rekening tujuan settlement diatur sepenuhnya di sisi Midtrans.",
      },
      { type: "h2", text: "Cara mengubah" },
      {
        type: "ol",
        items: [
          "Login ke dashboard Midtrans (dashboard.midtrans.com).",
          "Buka Settings → Bank Account.",
          "Tambah / pilih rekening baru, lalu submit dokumen verifikasi yang diminta.",
          "Setelah verifikasi (1–3 hari kerja), settlement berikutnya masuk ke rekening baru.",
        ],
      },
      { type: "h2", text: "Rekening manual transfer" },
      {
        type: "p",
        text:
          "Bila Anda pakai transfer manual (bukan QRIS dinamis), update rekening di Pengaturan → Pembayaran → Rekening Manual & QRIS Statis. Perubahan langsung berlaku untuk pesanan baru.",
      },
    ],
  },

  // === AKUN & PENGATURAN ===
  {
    slug: "menambah-staf-admin",
    category: "akun-pengaturan",
    title: "Menambah staf admin",
    excerpt:
      "Multi-user belum tersedia di MVP — hanya satu akun pemilik per toko.",
    readingTime: "1 menit",
    body: [
      {
        type: "p",
        text:
          "Untuk saat ini SellOn hanya mendukung satu akun pemilik per toko. Multi-user dengan role (admin / staff / kasir) ada di roadmap dan akan rilis di update mendatang.",
      },
      { type: "h2", text: "Workaround" },
      {
        type: "ul",
        items: [
          "Bagikan akses Google Anda ke staff (tidak direkomendasikan untuk privacy).",
          "Pakai akun Google bersama yang khusus untuk SellOn — buat alias di Google Workspace bila Anda pakai domain bisnis.",
          "Tunggu rilis multi-user di update mendatang.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Multi-user akan support role-based access (mis. staff hanya bisa update status pesanan, tidak bisa hapus produk).",
      },
    ],
  },
  {
    slug: "mengubah-profil-toko",
    category: "akun-pengaturan",
    title: "Mengubah profil toko",
    excerpt:
      "Update nama, deskripsi, logo, banner, jam buka, dan kontak di satu halaman.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Semua atribut publik toko diatur di Dasbor → Pengaturan → Profil Toko.",
      },
      { type: "h2", text: "Field yang bisa diubah" },
      {
        type: "ul",
        items: [
          "Nama toko, slug (alamat publik), kategori, kota.",
          "Deskripsi (multiline) dan tagline (1 kalimat).",
          "Logo (kotak ~512×512) dan banner (landscape ~1600×500).",
          "WhatsApp, Instagram, TikTok.",
          "Jam buka per hari + status 'Toko buka' (override jam).",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        text:
          "Mengubah slug akan mengubah URL publik toko. Link lama tidak otomatis di-redirect. Sebar slug baru ke pelanggan setelah update.",
      },
    ],
  },
  {
    slug: "notifikasi-via-whatsapp-dan-email",
    category: "akun-pengaturan",
    title: "Notifikasi via WhatsApp & email",
    excerpt:
      "Template WhatsApp untuk pembeli sudah otomatis. Notifikasi email untuk seller masih dalam roadmap.",
    readingTime: "2 menit",
    body: [
      { type: "h2", text: "Template WhatsApp ke pembeli" },
      {
        type: "p",
        text:
          "Setiap perubahan status pesanan otomatis kirim pesan WhatsApp ke pembeli (template bisa diedit di Pengaturan → WhatsApp).",
      },
      {
        type: "ul",
        items: [
          "order_received — saat pesanan baru masuk.",
          "order_confirmed — saat Anda klik Konfirmasi.",
          "order_shipped — saat Anda input resi.",
          "order_completed — saat status ke Selesai.",
          "payment_reminder — bila pembeli belum bayar setelah X jam.",
        ],
      },
      { type: "h2", text: "Notifikasi seller" },
      {
        type: "p",
        text:
          "MVP belum kirim notifikasi email/WhatsApp ke seller saat ada pesanan baru. Real-time notification ada di roadmap. Untuk sekarang, cek Dasbor → Pesanan secara berkala.",
      },
    ],
  },
  {
    slug: "upgrade-ke-pro",
    category: "berlangganan",
    title: "Upgrade ke Pro",
    excerpt:
      "Buka semua fitur tanpa batasan + hapus watermark di halaman toko publik.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Tier Pro menghapus batas produk, batas order/bulan, dan watermark SellOn di halaman toko publik. Saat ini pembayaran masih manual via transfer bank — automatic recurring akan datang di update mendatang.",
      },
      { type: "h2", text: "Cara upgrade" },
      {
        type: "ol",
        items: [
          "Pengaturan → Berlangganan → klik 'Upgrade ke Pro'.",
          "Pilih durasi (1, 3, 6, atau 12 bulan).",
          "Transfer ke rekening yang ditampilkan di dialog.",
          "Klik 'Saya sudah transfer' (atau kirim bukti via WhatsApp ke tim support).",
          "Tim akan aktifkan tier Pro dalam 1×24 jam setelah verifikasi.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Anda tetap bisa pakai SellOn selama proses verifikasi. Setelah aktif, tanggal expired ditampilkan di Pengaturan → Berlangganan.",
      },
    ],
  },
  {
    slug: "membatalkan-langganan",
    category: "berlangganan",
    title: "Membatalkan langganan",
    excerpt:
      "Cancel kapan saja — akses Pro tetap aktif sampai akhir periode yang sudah dibayar.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Karena pembayaran masih manual, membatalkan tidak menghentikan tagihan otomatis (tidak ada). Tombol 'Batalkan' menonaktifkan tier Pro saat periode habis — sampai itu, semua fitur Pro tetap aktif.",
      },
      { type: "h2", text: "Cara cancel" },
      {
        type: "ol",
        items: [
          "Pengaturan → Berlangganan → 'Batalkan langganan'.",
          "Konfirmasi dialog. Status berubah ke 'Dibatalkan'.",
          "Akses Pro tetap aktif sampai tanggal expired yang ditampilkan.",
          "Setelah lewat, tier turun ke Gratis otomatis.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Berubah pikiran sebelum periode habis? Klik 'Aktifkan kembali' di halaman yang sama untuk membatalkan pembatalan.",
      },
    ],
  },
  {
    slug: "riwayat-pembayaran",
    category: "berlangganan",
    title: "Riwayat pembayaran",
    excerpt:
      "Lihat semua transaksi langganan + status verifikasi di satu halaman.",
    readingTime: "1 menit",
    body: [
      {
        type: "p",
        text:
          "Setiap kali Anda klik 'Saya sudah transfer', sebuah baris invoice dibuat dengan status 'Menunggu verifikasi'. Setelah tim cek bukti transfer, status berubah ke 'Lunas'.",
      },
      { type: "h2", text: "Cara akses" },
      {
        type: "ol",
        items: [
          "Pengaturan → Berlangganan → scroll ke bagian 'Riwayat Pembayaran'.",
          "List semua transaksi diurutkan dari yang terbaru.",
          "Status: Menunggu verifikasi (kuning), Lunas (hijau), atau Gagal.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Butuh invoice PDF untuk reimbursement? Email halo@sellon.id dengan ID invoice — tim akan kirim file PDF resmi.",
      },
    ],
  },
  {
    slug: "tier-pro-vs-gratis",
    category: "berlangganan",
    title: "Bedanya Pro vs Gratis",
    excerpt:
      "Limit dan watermark di tier Gratis vs full access di Pro.",
    readingTime: "2 menit",
    body: [
      { type: "h2", text: "Tier Gratis" },
      {
        type: "ul",
        items: [
          "Maks 30 produk aktif.",
          "Maks 50 order/bulan.",
          "Laporan & insight 7 hari.",
          "Watermark 'SellOn' di halaman toko publik.",
        ],
      },
      { type: "h2", text: "Tier Pro" },
      {
        type: "ul",
        items: [
          "Produk & varian tak terbatas.",
          "Order tak terbatas.",
          "Bulk upload via Excel.",
          "Laporan & insight 90 hari.",
          "Promo + kupon diskon.",
          "Tanpa watermark di halaman toko.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Limit di tier Gratis akan diaktifkan secara bertahap; sekarang banyak fitur Pro yang masih bisa diakses dari Gratis untuk dicoba.",
      },
    ],
  },
  {
    slug: "menghapus-akun",
    category: "akun-pengaturan",
    title: "Menghapus akun",
    excerpt:
      "Hubungi tim untuk hapus akun. Data toko + pesanan akan dihapus permanen dalam 14 hari.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "MVP belum punya self-service delete di dashboard. Untuk menghapus akun, kirim email ke halo@sellon.id dari alamat email yang Anda pakai login Google.",
      },
      { type: "h2", text: "Yang akan dihapus" },
      {
        type: "ul",
        items: [
          "Akun Google → SellOn (bukan akun Google itu sendiri).",
          "Profil toko, produk, foto produk di storage.",
          "Database pelanggan, pesanan, dan promo.",
          "Server key Midtrans yang terenkripsi di sistem kami.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        text:
          "Penghapusan permanen, tidak bisa di-restore. Export data CSV (pelanggan, pesanan) dulu sebelum minta hapus.",
      },
    ],
  },

];

export function articleBySlug(slug: string): HelpArticle | null {
  return helpArticles.find((a) => a.slug === slug) ?? null;
}

export function articlesByCategory(catSlug: HelpCategorySlug): HelpArticle[] {
  return helpArticles.filter((a) => a.category === catSlug);
}
