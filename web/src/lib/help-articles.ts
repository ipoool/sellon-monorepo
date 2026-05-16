// Static help center registry. Each category has a small set of articles
// rendered as plain JSX inside src/app/help/[slug]/page.tsx. Keeping
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
          "Buka halaman /login dari mana saja di sellon.id.",
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
          "Halaman utama toko: sellon.id/{slug}. Halaman produk individual: sellon.id/{slug}/product/{slug-produk}. Halaman pembayaran pesanan: sellon.id/{slug}/order/{nomor-pesanan} (otomatis dikirim ke pembeli).",
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

  {
    slug: "atur-tampilan-dan-tema-toko",
    category: "memulai",
    title: "Mengatur tampilan dan tema toko",
    excerpt:
      "Pilih warna, layout produk, logo, dan banner supaya toko tampil konsisten dengan brand kamu.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "Tampilan toko bisa dikustomisasi lewat Pengaturan → Tampilan Storefront. Semua perubahan langsung live tanpa perlu redeploy.",
      },
      { type: "h2", text: "Warna tema" },
      {
        type: "p",
        text:
          "Geser slider 'Warna Brand' untuk memilih warna utama. Tersedia preview langsung di halaman yang sama. Pilih warna yang konsisten dengan logo atau kemasan produk Anda.",
      },
      { type: "h2", text: "Layout produk" },
      {
        type: "ul",
        items: [
          "Grid — 2 kolom, klasik, cocok untuk produk dengan foto kotak.",
          "List — 1 baris per produk, cocok untuk katalog makanan dengan deskripsi panjang.",
          "Showcase — foto besar featured + grid di bawah.",
          "Compact — 3 kolom, padat, cocok untuk toko dengan banyak produk.",
          "Magazine — layout editorial dengan aksen besar.",
          "Feed — tampilan scroll vertikal ala media sosial.",
        ],
      },
      { type: "h2", text: "Logo dan banner" },
      {
        type: "p",
        text:
          "Upload logo (rasio 1:1, min 256×256 px) dan banner (rasio 16:5, min 1200×375 px). Format JPG/PNG/WebP, maks 5 MB per file.",
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Fitur kustomisasi tampilan (tema warna + layout produk) tersedia untuk paket Pro ke atas.",
      },
    ],
  },
  {
    slug: "cara-menggunakan-mode-sandbox",
    category: "memulai",
    title: "Cara menggunakan mode sandbox sebelum go live",
    excerpt:
      "Uji semua alur pembayaran tanpa uang asli sebelum aktifkan production.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "Mode sandbox Midtrans memungkinkan Anda menguji seluruh alur checkout — dari halaman pembayaran, webhook, sampai update status pesanan — tanpa memproses uang asli.",
      },
      { type: "h2", text: "Setup sandbox" },
      {
        type: "ol",
        items: [
          "Buka dashboard.sandbox.midtrans.com dan login.",
          "Dapatkan Sandbox Server Key dari Settings → Access Keys.",
          "Di SellOn: Pengaturan → Pembayaran → pilih mode 'Sandbox', tempel key.",
          "Simpan dan klik 'Tes Koneksi' — harus muncul konfirmasi hijau.",
        ],
      },
      { type: "h2", text: "Melakukan test pembayaran" },
      {
        type: "p",
        text:
          "Buka halaman publik toko Anda di browser lain, buat pesanan, dan bayar menggunakan nomor kartu/QRIS test yang tersedia di dokumentasi Midtrans (docs.midtrans.com → Testing Payment). Webhook akan otomatis update status pesanan di SellOn.",
      },
      {
        type: "callout",
        tone: "warning",
        text:
          "Saat siap go live, ganti ke mode Production dan masukkan key production. Jangan pakai key production di sandbox — dua environment ini tidak saling kenal.",
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

  {
    slug: "bulk-upload-produk-excel",
    category: "produk-katalog",
    title: "Bulk upload produk via Excel",
    excerpt:
      "Upload ratusan produk sekaligus lewat template XLSX — hemat waktu vs input satu per satu.",
    readingTime: "5 menit",
    body: [
      {
        type: "p",
        text:
          "Fitur bulk upload cocok untuk penjual dengan katalog besar (puluhan sampai ratusan SKU). Proses berjalan di background — Anda bisa navigasi halaman lain sambil menunggu.",
      },
      { type: "h2", text: "Langkah upload" },
      {
        type: "ol",
        items: [
          "Dasbor → Produk → klik 'Bulk Upload'.",
          "Unduh template XLSX dari halaman tersebut.",
          "Isi kolom: nama, harga, stok, kategori, deskripsi, berat (gram), status.",
          "Simpan file lalu upload ke halaman Bulk Upload.",
          "Tunggu notifikasi selesai di pojok kanan atas dasbor.",
        ],
      },
      { type: "h2", text: "Aturan template" },
      {
        type: "ul",
        items: [
          "Baris pertama adalah header — jangan diubah.",
          "Harga diisi dalam Rupiah penuh, tanpa titik/koma (mis. 25000).",
          "Status: 'active', 'inactive', atau 'sold_out'.",
          "Kategori harus sesuai nama kategori yang sudah Anda buat di Pengaturan → Kategori.",
          "Maksimal 500 baris per file.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Bulk upload tersedia untuk paket Pro ke atas. Untuk paket Gratis, tambah produk satu per satu via form.",
      },
    ],
  },
  {
    slug: "mengatur-produk-featured",
    category: "produk-katalog",
    title: "Mengatur produk unggulan (featured)",
    excerpt:
      "Produk featured tampil pertama di katalog dan lebih menonjol di beberapa layout.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "Produk featured adalah produk yang Anda pilih untuk ditampilkan paling atas atau paling menonjol di halaman publik toko. Cocok untuk best-seller, produk baru, atau promo.",
      },
      { type: "h2", text: "Cara mengaktifkan" },
      {
        type: "ol",
        items: [
          "Buka Dasbor → Produk → klik produk yang ingin di-feature.",
          "Di halaman edit, cari toggle 'Produk Unggulan' dan aktifkan.",
          "Simpan. Produk langsung tampil di posisi teratas katalog.",
        ],
      },
      {
        type: "ul",
        items: [
          "Tidak ada limit berapa produk yang bisa di-feature.",
          "Di layout Showcase, produk pertama yang featured tampil sebagai hero banner besar.",
          "Urutan featured mengikuti urutan tanggal upload (terbaru di atas).",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Rotasi produk featured secara berkala (setiap minggu atau promo musiman) terbukti meningkatkan engagement pembeli yang balik berkunjung.",
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

  {
    slug: "export-pesanan-csv",
    category: "pesanan",
    title: "Export pesanan ke CSV",
    excerpt:
      "Download semua pesanan atau filter per rentang tanggal ke file CSV untuk analisis.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "SellOn menyediakan export CSV dari halaman Pesanan — berguna untuk rekap bulanan, laporan toko, atau import ke Excel/Google Sheets.",
      },
      { type: "h2", text: "Cara export" },
      {
        type: "ol",
        items: [
          "Dasbor → Pesanan.",
          "Filter tanggal bila perlu (mis. bulan ini saja).",
          "Klik tombol 'Export CSV' di pojok kanan atas tabel.",
          "File langsung terunduh ke perangkat Anda.",
        ],
      },
      { type: "h2", text: "Kolom yang tersedia" },
      {
        type: "ul",
        items: [
          "Nomor pesanan, tanggal, status pesanan, status bayar.",
          "Nama & WhatsApp pembeli, kota, alamat.",
          "Produk + varian + kuantitas, subtotal, ongkir, diskon, total.",
          "Kurir, nomor resi, tanggal kirim.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Export CSV tidak termasuk catatan internal penjual (seller notes) untuk menjaga privasi workflow internal.",
      },
    ],
  },
  {
    slug: "pesanan-digital-delivery",
    category: "pesanan",
    title: "Mengelola pesanan produk digital",
    excerpt:
      "Produk digital dikirim otomatis via email + link download setelah pembayaran lunas.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "Untuk produk dengan tipe 'Digital', SellOn otomatis mengirim email ke pembeli berisi link download atau URL akses setelah status pembayaran menjadi 'Lunas'.",
      },
      { type: "h2", text: "Setup produk digital" },
      {
        type: "ol",
        items: [
          "Dasbor → Produk → Tambah/Edit Produk.",
          "Di bagian 'Tipe Produk', pilih 'Digital'.",
          "Upload file digital (PDF, ZIP, dll.) atau isi URL akses eksternal.",
          "Isi instruksi penggunaan yang akan ditampilkan ke pembeli bersama link.",
          "Simpan produk.",
        ],
      },
      { type: "h2", text: "Alur pengiriman" },
      {
        type: "p",
        text:
          "Begitu pembayaran dikonfirmasi (webhook Midtrans atau konfirmasi manual), sistem otomatis kirim email dengan link download ke alamat email pembeli. Link berlaku selama 7 hari.",
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Produk digital tidak butuh input resi atau perubahan status ke 'Dikirim' — sistem langsung set ke 'Selesai' setelah pengiriman email sukses.",
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
      { type: "h2", text: "Tier Gratis (Rp 0/bulan)" },
      {
        type: "ul",
        items: [
          "Sampai 30 produk.",
          "Pembayaran QRIS.",
          "1 staf admin.",
          "Laporan dasar.",
        ],
      },
      { type: "h2", text: "Tier Pro (Rp 99.000/bulan)" },
      {
        type: "ul",
        items: [
          "Produk tanpa batas.",
          "Otomasi WhatsApp.",
          "5 staf admin.",
          "Integrasi kurir.",
          "Laporan lengkap.",
        ],
      },
      { type: "h2", text: "Tier Bisnis (Rp 299.000/bulan)" },
      {
        type: "ul",
        items: [
          "Semua fitur Pro.",
          "Multi-cabang.",
          "Staf tanpa batas.",
          "API & webhook.",
          "Priority support.",
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
  {
    slug: "mengaktifkan-custom-domain",
    category: "akun-pengaturan",
    title: "Mengaktifkan custom domain",
    excerpt:
      "Pakai domain sendiri (mis. toko.namabrand.com) sebagai alamat toko kamu.",
    readingTime: "4 menit",
    body: [
      {
        type: "p",
        text:
          "Custom domain memungkinkan toko Anda tampil di domain sendiri — bukan lagi sellon.id/nama-toko. Pembeli tetap mengakses halaman yang sama, tapi URL-nya milik Anda.",
      },
      { type: "h2", text: "Persyaratan" },
      {
        type: "ul",
        items: [
          "Anda harus memiliki atau mengontrol domain tersebut.",
          "Paket Pro atau Bisnis (custom domain tidak tersedia di Gratis).",
          "Akses ke panel DNS domain Anda (Niagahoster, Cloudflare, GoDaddy, dll.).",
        ],
      },
      { type: "h2", text: "Cara setup" },
      {
        type: "ol",
        items: [
          "Pengaturan → Profil Toko → scroll ke bagian 'Custom Domain'.",
          "Masukkan subdomain yang ingin Anda pakai (mis. toko.namabrand.com).",
          "Salin nilai CNAME yang ditampilkan.",
          "Buka panel DNS domain Anda, tambah record CNAME dengan nilai tersebut.",
          "Kembali ke SellOn dan klik 'Verifikasi' — proses propagasi DNS bisa butuh 5–60 menit.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "SSL otomatis dibuatkan setelah verifikasi domain berhasil. Pembeli akan selalu diarahkan ke HTTPS.",
      },
    ],
  },
  {
    slug: "kelola-staf-dan-akses",
    category: "akun-pengaturan",
    title: "Mengelola staf dan hak akses",
    excerpt:
      "Undang staf dengan role Admin atau Staff — batasi apa yang bisa mereka lakukan di dasbor.",
    readingTime: "3 menit",
    body: [
      {
        type: "p",
        text:
          "Mulai paket Pro, Anda bisa mengundang staf dengan dua role berbeda. Staf login dengan akun Google mereka sendiri — Anda tidak perlu berbagi password.",
      },
      { type: "h2", text: "Role yang tersedia" },
      {
        type: "ul",
        items: [
          "Admin — akses hampir sama dengan owner. Bisa kelola produk, pesanan, pelanggan, promo, dan pengaturan toko.",
          "Staff — akses terbatas. Hanya bisa lihat + update status pesanan dan input resi.",
        ],
      },
      { type: "h2", text: "Cara undang staf" },
      {
        type: "ol",
        items: [
          "Pengaturan → Tim → klik 'Undang Staf'.",
          "Masukkan alamat email Google staf dan pilih role.",
          "Staf mendapat email undangan. Setelah mereka login, mereka otomatis terhubung ke toko Anda.",
        ],
      },
      { type: "h2", text: "Batas staf per paket" },
      {
        type: "ul",
        items: [
          "Gratis: 0 staf (hanya owner).",
          "Pro: hingga 5 staf.",
          "Bisnis: staf tidak terbatas.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        text:
          "Hapus staf dari Pengaturan → Tim bila mereka sudah tidak bekerja di toko Anda. Akses langsung dicabut begitu dihapus.",
      },
    ],
  },
  {
    slug: "mengatur-notifikasi-pesanan-baru",
    category: "akun-pengaturan",
    title: "Notifikasi pesanan baru ke WhatsApp seller",
    excerpt:
      "Aktifkan notifikasi WA ke nomor Anda supaya tidak ketinggalan pesanan masuk.",
    readingTime: "2 menit",
    body: [
      {
        type: "p",
        text:
          "SellOn bisa mengirim notifikasi WhatsApp ke nomor Anda setiap kali ada pesanan baru. Nomor notifikasi bisa berbeda dari nomor WhatsApp toko yang dipakai pembeli untuk chat.",
      },
      { type: "h2", text: "Cara aktifkan" },
      {
        type: "ol",
        items: [
          "Pengaturan → Profil Toko → scroll ke 'Notifikasi'.",
          "Aktifkan toggle 'Notifikasi WA pesanan baru'.",
          "Isi nomor WhatsApp tujuan notifikasi (format: 628xxxx).",
          "Simpan. Test dengan membuat pesanan dummy dari halaman publik toko.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text:
          "Notifikasi dikirim menggunakan integrasi Twilio. Pastikan nomor yang Anda daftarkan aktif menerima pesan dari nomor asing.",
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
