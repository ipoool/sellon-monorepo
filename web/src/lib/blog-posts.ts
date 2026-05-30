// Static blog content. Bahasa Indonesia, untuk audience UMKM seller online.
// Body dipecah jadi sections (heading + paragraphs/bullets/callout) supaya
// renderer tetap sederhana — tanpa Markdown parser.
//
// Tutorial/panduan produk (dengan screenshot) hidup di ./tutorial-posts.ts dan
// digabung ke `blogPosts` di bawah, supaya renderer & route /blog/<slug> sama.
import { tutorialPosts } from "./tutorial-posts";

type BlogSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: { kind: "tip" | "warn"; title: string; body: string };
  // Optional screenshot/illustration rendered inside the section (used by
  // tutorial posts). Path is served from /public (e.g. /tutorials/<slug>/01.png).
  image?: { src: string; alt: string; caption?: string };
};

export type BlogPost = {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  publishedAt: string; // ISO date string
  readingTime: string;
  featured: boolean;
  coverColor: string; // Tailwind gradient classes untuk decorative cover (fallback)
  // Optional real cover image (tutorial posts use a nanobanana illustration).
  // When set, listing + detail render this instead of the gradient block.
  coverImage?: string;
  // Optional plan badge for tutorial posts (free/pro/bisnis).
  plan?: "free" | "pro" | "bisnis";
  sections: BlogSection[];
};

const marketingPosts: BlogPost[] = [
  {
    slug: "cara-jualan-whatsapp-tanpa-ribet",
    coverImage: "/blog/cara-jualan-whatsapp-tanpa-ribet/cover.png",
    category: "Strategi Jualan",
    title: "5 Cara Jualan Lewat WhatsApp Tanpa Harus Balas Chat Satu per Satu",
    excerpt:
      "Banyak seller kelelahan karena jadi 'mesin balas chat'. Padahal ada cara supaya pembeli bisa order dan bayar sendiri — tanpa kamu harus standby 24 jam.",
    publishedAt: "2026-05-01",
    readingTime: "7 menit",
    featured: true,
    coverColor: "from-brand-500 to-brand-700",
    sections: [
      {
        paragraphs: [
          "Kalau kamu jual lewat WhatsApp, kamu pasti kenal skenario ini: pagi-pagi sudah ada yang chat tanya harga, lalu tanya stok, lalu minta foto tambahan, lalu hilang begitu saja. Belum sampai jam 9 sudah ada 12 pesan belum dibalas. Ini bukan salah pembelinya — ini masalah sistem.",
          "Kabar baiknya: bukan berarti kamu harus hire admin atau beli software mahal. Ada 5 perubahan sederhana yang bisa langsung kamu terapkan hari ini.",
        ],
      },
      {
        heading: "1. Bikin link katalog yang bisa dibuka pembeli kapan saja",
        paragraphs: [
          "WhatsApp Business punya fitur katalog, tapi tampilannya terbatas dan tidak ada checkout. Yang lebih efektif adalah link toko online yang bisa dibuka lewat WhatsApp — pembeli tinggal klik, lihat produk, pilih, dan checkout sendiri.",
          "SellOn dirancang persis untuk ini: satu link, pembeli langsung masuk ke halaman katalog kamu lengkap dengan harga, stok, dan tombol beli. Kamu tidak perlu balas satu per satu karena semua informasi sudah ada di sana.",
        ],
        callout: {
          kind: "tip",
          title: "Tips praktis",
          body: "Taruh link katalog di bio WhatsApp Business dan di awal setiap broadcast. Tulis singkat: 'Cek lengkap di: [link]'. Banyak pembeli yang sebenarnya lebih suka lihat sendiri daripada nunggu dibalas.",
        },
      },
      {
        heading: "2. Gunakan Quick Reply untuk pertanyaan yang berulang",
        paragraphs: [
          "WhatsApp Business punya fitur Quick Reply — pesan instan yang bisa kamu kirim dengan ketik satu kata kunci. Setup jawaban untuk pertanyaan paling sering: 'berapa ongkir?', 'ada COD?', 'bisa custom?', 'minimal order berapa?'.",
          "Luangkan 30 menit sekali untuk setup Quick Reply ini. Setelah itu, menjawab pertanyaan yang sama cukup 2 detik.",
        ],
      },
      {
        heading: "3. Tentukan jam operasional dan komunikasikan dengan jelas",
        paragraphs: [
          "Satu penyebab kelelahan terbesar adalah tidak adanya batas waktu. Kalau kamu balas chat jam 11 malam, pembeli akan expect kamu selalu standby malam hari.",
          "Set jam operasional di profil WhatsApp Business: misalnya Senin–Sabtu 08.00–17.00. Aktifkan pesan otomatis 'di luar jam operasional' dengan estimasi kapan akan dibalas. Pembeli yang serius akan menunggu — yang tidak serius memang tidak akan jadi pembeli.",
        ],
      },
      {
        heading: "4. Broadcast sekali, reach banyak — bukan forward satu-satu",
        paragraphs: [
          "Kirim update produk, promo, atau stok baru lewat fitur Broadcast di WhatsApp Business. Satu pesan, sampai ke semua kontak yang sudah pernah chat dengan kamu — tanpa harus forward manual.",
          "Kuncinya: buat daftar broadcast berdasarkan segmen. Misalnya, pisah antara pelanggan aktif, pelanggan yang lama tidak order, dan calon pembeli yang pernah tanya tapi belum beli.",
        ],
      },
      {
        heading: "5. Pisahkan 'chat jualan' dan 'chat pribadi'",
        paragraphs: [
          "Kalau kamu pakai nomor yang sama untuk jualan dan keperluan pribadi, kamu tidak akan pernah bisa 'menutup toko'. Pisahkan: satu nomor khusus bisnis (bisa nomor baru atau nomor lama yang dijadikan WhatsApp Business), satu nomor pribadi.",
          "Ini bukan soal menghindari pelanggan — ini soal kamu bisa istirahat dengan tenang tanpa rasa bersalah tiap kali melihat notifikasi.",
        ],
        callout: {
          kind: "warn",
          title: "Jangan abaikan ini",
          body: "Seller yang kelelahan cenderung balas chat dengan nada kurang ramah, lupa follow-up, atau malah tidak konsisten promosi. Menjaga energi kamu sama pentingnya dengan menjaga pelanggan.",
        },
      },
    ],
  },
  {
    slug: "apa-itu-qris-panduan-lengkap",
    coverImage: "/blog/apa-itu-qris-panduan-lengkap/cover.png",
    category: "Pembayaran",
    title: "Apa Itu QRIS? Panduan Lengkap untuk Seller Online Indonesia",
    excerpt:
      "QRIS bukan sekadar kode kotak-kotak. Kalau kamu jualan online di Indonesia dan belum pakai QRIS, kamu mungkin kehilangan banyak pembeli yang lebih suka bayar digital.",
    publishedAt: "2026-05-03",
    readingTime: "6 menit",
    featured: false,
    coverColor: "from-blue-500 to-indigo-600",
    sections: [
      {
        paragraphs: [
          "QRIS — singkatan dari Quick Response Code Indonesian Standard — adalah standar pembayaran QR nasional yang dibuat oleh Bank Indonesia. Artinya, satu kode QR bisa menerima pembayaran dari hampir semua aplikasi: GoPay, OVO, DANA, ShopeePay, BCA Mobile, BNI Mobile, dan masih banyak lagi.",
          "Untuk seller online Indonesia, ini perubahan besar. Dulu harus punya rekening di banyak bank supaya bisa terima transfer dari semua pembeli. Sekarang cukup satu QRIS.",
        ],
      },
      {
        heading: "Bagaimana cara kerja QRIS?",
        paragraphs: [
          "Pembeli membuka aplikasi e-wallet atau mobile banking mereka, pilih 'Scan QR', arahkan ke kode QRIS kamu, masukkan nominal, konfirmasi. Uang masuk ke rekening merchant kamu — biasanya real-time atau maksimal 1x24 jam.",
          "Dari sisi seller, kamu terima notifikasi pembayaran masuk langsung di dashboard penyedia QRIS kamu (Midtrans, Xendit, atau penyedia lainnya).",
        ],
      },
      {
        heading: "Berapa biaya QRIS?",
        bullets: [
          "MDR (Merchant Discount Rate) QRIS: 0,7% per transaksi untuk merchant reguler",
          "MDR 0,3% untuk transaksi di sektor pendidikan, SPBU, dan beberapa kategori khusus",
          "Tidak ada biaya bulanan atau setup fee — kamu hanya bayar per transaksi yang masuk",
          "Tidak ada biaya untuk pembeli — 0,7% sepenuhnya ditanggung merchant",
        ],
        callout: {
          kind: "tip",
          title: "Perhitungan sederhana",
          body: "Kalau kamu terima transaksi Rp 100.000, biaya QRIS = Rp 700. Kamu terima Rp 99.300. Ini jauh lebih murah dari biaya transfer bank manual yang sering dibebankan ke pembeli (dan sering jadi alasan gagal bayar).",
        },
      },
      {
        heading: "Cara daftar QRIS untuk seller online",
        bullets: [
          "Daftar ke penyedia payment gateway: Midtrans, Xendit, atau Doku — semuanya sudah terintegrasi dengan QRIS Bank Indonesia",
          "Siapkan dokumen: KTP, NPWP (kalau ada), dan rekening bank atas nama kamu/usaha",
          "Proses verifikasi biasanya 1–3 hari kerja",
          "Setelah aktif, kamu dapat kode QRIS statis (untuk dibagikan ke pembeli) atau QRIS dinamis (nominal otomatis terbaca saat scan)",
        ],
      },
      {
        heading: "QRIS statis vs QRIS dinamis — mana yang cocok untuk jualan online?",
        paragraphs: [
          "QRIS statis: satu kode untuk semua transaksi. Pembeli scan, lalu input nominal sendiri. Cocok untuk toko fisik atau seller yang mau simpel.",
          "QRIS dinamis: nominal sudah tertanam di kode QR, berbeda tiap transaksi. Lebih aman karena tidak ada risiko pembeli salah input nominal. Ini yang dipakai di checkout SellOn — setiap order punya QR dengan nominal yang sudah terisi otomatis.",
        ],
        callout: {
          kind: "tip",
          title: "Rekomendasi untuk seller online",
          body: "Pakai QRIS dinamis yang terintegrasi langsung di sistem checkout. Pembeli tidak perlu input nominal, kamu tidak perlu konfirmasi manual. Lebih sedikit gesekan = lebih banyak konversi.",
        },
      },
    ],
  },
  {
    slug: "foto-produk-pakai-hp",
    coverImage: "/blog/foto-produk-pakai-hp/cover.png",
    category: "Tips Jualan",
    title: "Cara Foto Produk Pakai HP Biar Keliatan Profesional",
    excerpt:
      "Foto produk yang bagus bisa naikkan konversi sampai 2–3x. Dan kamu tidak butuh kamera mahal atau studio — cukup HP, cahaya alami, dan beberapa trik sederhana.",
    publishedAt: "2026-05-06",
    readingTime: "8 menit",
    featured: false,
    coverColor: "from-orange-400 to-rose-500",
    sections: [
      {
        paragraphs: [
          "Riset menunjukkan bahwa pembeli online membuat keputusan beli dalam 7 detik pertama — dan sebagian besar keputusan itu berdasarkan foto produk. Foto buram, gelap, atau berantakan bisa bikin produk bagus terlihat murahan.",
          "Kabar bagusnya: HP kamu sudah lebih dari cukup. Yang membedakan foto produk amatir dan profesional bukan kameranya — tapi pencahayaan, komposisi, dan latar belakang.",
        ],
      },
      {
        heading: "1. Manfaatkan cahaya alami dari jendela",
        paragraphs: [
          "Cahaya paling bagus untuk foto produk adalah cahaya matahari tidak langsung — artinya, taruh produk di dekat jendela tapi tidak kena sinar matahari langsung. Waktu terbaik: pagi hari (07.00–10.00) atau sore (15.00–17.00).",
          "Hindari foto di bawah lampu kuning ruangan — warnanya akan terlihat orange dan tidak natural. Kalau terpaksa foto malam hari, pakai dua lampu putih di kiri dan kanan produk untuk menghilangkan bayangan keras.",
        ],
        callout: {
          kind: "tip",
          title: "Trik bayangan",
          body: "Tempelkan selembar kertas putih atau karton di sisi berlawanan dari sumber cahaya. Kertas ini akan memantulkan cahaya ke sisi yang gelap dan mengurangi bayangan. Hasilnya: foto lebih rata dan bersih tanpa peralatan tambahan.",
        },
      },
      {
        heading: "2. Latar belakang sederhana selalu menang",
        bullets: [
          "Kertas karton putih A3 (Rp 3.000 di toko alat tulis): latar belakang paling serbaguna",
          "Kain linen atau kain polos abu/putih untuk kesan natural dan warm",
          "Kayu cutting board atau tatami bambu untuk produk makanan dan handmade",
          "Hindari: lantai bermotif, meja penuh barang, atau latar ramai — produk jadi tidak fokus",
        ],
      },
      {
        heading: "3. Atur komposisi dengan rule of thirds",
        paragraphs: [
          "Aktifkan grid di kamera HP kamu (biasanya di Settings > Grid Lines). Bayangkan foto dibagi jadi 9 kotak sama besar. Taruh produk di salah satu titik perpotongan garis grid — bukan di tengah-tengah.",
          "Ini membuat foto terasa lebih dinamis dan menarik secara visual. Untuk produk tunggal, bisa juga di tengah — tapi pastikan ada ruang 'napas' di sekeliling produk, tidak penuh sesak.",
        ],
      },
      {
        heading: "4. Ambil banyak sudut — jangan cuma satu",
        bullets: [
          "Tampak depan: foto utama yang pertama dilihat pembeli",
          "Tampak samping dan belakang: pembeli ingin tahu bentuk lengkapnya",
          "Detail close-up: tekstur, jahitan, label, atau fitur unggulan produk",
          "Konteks penggunaan: produk dipakai atau ditaruh di setting yang relevan",
          "Ukuran: foto produk di sebelah benda yang semua orang tahu ukurannya (misalnya tangan, atau botol minum)",
        ],
      },
      {
        heading: "5. Edit ringan pakai aplikasi gratis",
        paragraphs: [
          "Aplikasi Snapseed (gratis, iOS & Android) sudah lebih dari cukup. Yang perlu diedit: brightness (kecerahan), contrast (kontras), dan white balance (suhu warna — pastikan warna produk akurat).",
          "Jangan over-edit. Foto produk yang terlalu 'difilter' bisa bikin pembeli kecewa karena produk aslinya terlihat beda. Akurasi warna lebih penting dari estetika.",
        ],
        callout: {
          kind: "warn",
          title: "Hindari ini",
          body: "Jangan paparkan foto produk yang sama persis dengan foto dari supplier atau marketplace lain. Foto sendiri, meskipun lebih sederhana, terasa lebih otentik dan membangun kepercayaan pembeli.",
        },
      },
    ],
  },
  {
    slug: "cara-menentukan-harga-jual-umkm",
    coverImage: "/blog/cara-menentukan-harga-jual-umkm/cover.png",
    category: "Strategi Jualan",
    title: "Cara Menentukan Harga Jual yang Tepat untuk Produk UMKM",
    excerpt:
      "Harga terlalu murah bikin rugi, terlalu mahal bikin sepi. Artikel ini kasih kamu formula konkret untuk hitung harga jual yang menguntungkan dan tetap kompetitif.",
    publishedAt: "2026-05-08",
    readingTime: "9 menit",
    featured: false,
    coverColor: "from-emerald-500 to-teal-600",
    sections: [
      {
        paragraphs: [
          "Banyak UMKM yang menentukan harga berdasarkan perasaan atau sekadar 'ngikut kompetitor'. Hasilnya: ada yang jual terlalu murah sampai tidak balik modal, ada yang jual terlalu mahal sampai sepi pembeli.",
          "Menentukan harga bukan seni — ini ilmu. Ada formula yang bisa kamu pakai hari ini.",
        ],
      },
      {
        heading: "Langkah 1: Hitung Harga Pokok Penjualan (HPP) yang jujur",
        paragraphs: [
          "HPP adalah total biaya yang kamu keluarkan untuk menghasilkan satu unit produk. Banyak UMKM yang lupa memasukkan biaya-biaya 'tersembunyi' sehingga HPP-nya tidak akurat.",
        ],
        bullets: [
          "Bahan baku: harga per unit produk yang kamu jual",
          "Kemasan: box, bubble wrap, stiker, pita, label",
          "Ongkos kirim ke kamu (kalau beli dari supplier): dihitung per unit",
          "Biaya produksi: listrik, gas, bahan bakar, atau sewa alat",
          "Waktu kerja kamu: kalau kamu yang buat produknya, hitung upah per jam × waktu pembuatan",
          "Biaya platform: komisi marketplace, fee payment gateway (QRIS 0,7%, dll)",
        ],
        callout: {
          kind: "warn",
          title: "Kesalahan paling umum",
          body: "Lupa hitung nilai waktu sendiri. Kalau kamu produksi 10 item dalam 2 jam dan tidak menghitung waktu itu sebagai biaya, kamu sebenarnya sudah 'mencuri' dari diri sendiri. Waktu kamu punya nilai — hitunglah.",
        },
      },
      {
        heading: "Langkah 2: Tentukan margin keuntungan target",
        paragraphs: [
          "Setelah tahu HPP, tentukan berapa persen keuntungan yang kamu mau. Panduan umum berdasarkan jenis produk:",
        ],
        bullets: [
          "Produk fisik handmade: 40–70% margin dari HPP (kompensasi tenaga kerja tinggi)",
          "Produk resell/dropship: 20–35% margin sudah bagus",
          "Produk digital (template, preset, ebook): 70–90% karena HPP sangat rendah",
          "Produk makanan: 50–100% margin untuk cover risiko kadaluarsa dan biaya dapur",
        ],
      },
      {
        heading: "Langkah 3: Formula harga jual",
        paragraphs: [
          "Formula dasarnya: Harga Jual = HPP ÷ (1 - Margin%)",
          "Contoh: HPP = Rp 30.000, target margin 40%. Harga jual = 30.000 ÷ (1 - 0,4) = 30.000 ÷ 0,6 = Rp 50.000.",
          "Dengan harga Rp 50.000, keuntungan kamu Rp 20.000 (40% dari Rp 50.000). Bukan Rp 20.000 dari Rp 30.000 (yang berarti 67% markup dari HPP — keduanya berbeda!).",
        ],
        callout: {
          kind: "tip",
          title: "Margin vs markup",
          body: "Margin dihitung dari harga jual. Markup dihitung dari HPP. Kalau kamu bilang 'markup 50%' artinya harga jual = HPP × 1,5. Kalau 'margin 50%' artinya HPP = harga jual × 0,5. Pastikan kamu konsisten dalam perhitungan.",
        },
      },
      {
        heading: "Langkah 4: Validasi dengan riset pasar",
        paragraphs: [
          "Setelah dapat angka, cek apakah harga kamu masuk akal di pasar. Cari 5–10 produk serupa di marketplace atau media sosial. Posisikan produk kamu: apakah ingin jadi yang termurah, di tengah, atau premium?",
          "Kalau harga kamu jauh di atas pasar, bukan berarti harus turun — tapi kamu perlu bisa jelaskan kenapa lebih mahal (kualitas bahan, handmade, packaging premium, layanan lebih baik).",
        ],
      },
    ],
  },
  {
    slug: "toko-online-sendiri-vs-marketplace",
    coverImage: "/blog/toko-online-sendiri-vs-marketplace/cover.png",
    category: "UMKM Digital",
    title: "Punya Toko Online Sendiri vs Jualan di Marketplace: Mana Lebih Untung?",
    excerpt:
      "Tokopedia dan Shopee memberi traffic besar, tapi ada harga yang harus dibayar. Toko online sendiri lebih merdeka, tapi kamu harus bawa traffic sendiri. Ini perbandingan jujurnya.",
    publishedAt: "2026-05-10",
    readingTime: "8 menit",
    featured: false,
    coverColor: "from-violet-500 to-purple-700",
    sections: [
      {
        paragraphs: [
          "Tidak ada jawaban tunggal 'mana yang lebih baik' — keduanya punya tempat. Tapi banyak seller yang membuat pilihan berdasarkan asumsi yang salah dan akhirnya rugi waktu dan uang.",
          "Mari kita bedah secara jujur: apa keuntungan dan kekurangan masing-masing, dan kapan kamu harus prioritaskan yang mana.",
        ],
      },
      {
        heading: "Marketplace (Tokopedia, Shopee, Lazada, dll)",
        paragraphs: [
          "Keuntungan terbesar marketplace: traffic sudah ada. Jutaan pembeli aktif setiap hari membuka aplikasi untuk mencari dan membeli. Kamu tidak perlu membangun audiens dari nol.",
        ],
        bullets: [
          "✓ Traffic instan tanpa perlu marketing besar",
          "✓ Sistem pembayaran dan logistik sudah terintegrasi",
          "✓ Kepercayaan pembeli sudah ada (branding marketplace)",
          "✗ Komisi: 2–15% dari setiap transaksi tergantung kategori",
          "✗ Persaingan harga brutal — mudah disaingi dengan produk serupa",
          "✗ Tidak punya data pembeli — kamu tidak tahu siapa yang beli",
          "✗ Aturan bisa berubah kapan saja, akun bisa kena suspend",
          "✗ Tampilan dan identitas brand terbatas",
        ],
      },
      {
        heading: "Toko Online Sendiri (SellOn, Shopify, dll)",
        paragraphs: [
          "Toko online sendiri memberi kamu kontrol penuh — atas brand, data pelanggan, harga, dan pengalaman belanja. Tapi tanggung jawab traffic ada di tangan kamu.",
        ],
        bullets: [
          "✓ Tidak ada komisi per transaksi (cukup bayar langganan tetap)",
          "✓ Data pelanggan milik kamu — bisa retargeting dan CRM",
          "✓ Brand identity penuh — tampilan, nama domain, warna",
          "✓ Tidak ada risiko kena suspend platform",
          "✓ Cocok untuk WhatsApp commerce: share satu link, pembeli checkout sendiri",
          "✗ Traffic harus dibangun sendiri (social media, WA broadcast, iklan)",
          "✗ Butuh lebih banyak usaha di awal untuk setup dan bawa pengunjung",
        ],
      },
      {
        heading: "Strategi yang banyak dipakai seller sukses: keduanya",
        paragraphs: [
          "Seller yang paling berkembang biasanya tidak memilih satu dan meninggalkan yang lain — mereka pakai keduanya dengan fungsi berbeda.",
          "Marketplace dipakai untuk akuisisi pelanggan baru: orang yang tidak kenal brand kamu bisa menemukan produk kamu. Toko online sendiri dipakai untuk retensi: pelanggan yang sudah beli di marketplace diarahkan untuk order langsung lewat WhatsApp dan link toko kamu — tanpa komisi marketplace.",
        ],
        callout: {
          kind: "tip",
          title: "Taktik klasik",
          body: "Sertakan kartu ucapan atau nota di setiap paket: 'Order langsung ke kami via WhatsApp dan hemat [jumlah] karena tanpa biaya platform. Link toko: [link SellOn kamu]'. Banyak pembeli senang bisa harga lebih murah, kamu senang tidak bayar komisi.",
        },
      },
      {
        heading: "Kapan prioritaskan toko online sendiri?",
        bullets: [
          "Kamu sudah punya basis pelanggan dari WhatsApp atau media sosial",
          "Produk kamu bukan komoditas — ada diferensiasi yang tidak mudah dibandingkan",
          "Kamu ingin membangun brand, bukan sekadar jual produk",
          "Kamu sudah lelah dengan perang harga di marketplace",
          "Kamu ingin kontrol penuh atas pengalaman belanja pembeli",
        ],
      },
    ],
  },
  {
    slug: "cara-tingkatkan-repeat-order",
    coverImage: "/blog/cara-tingkatkan-repeat-order/cover.png",
    category: "Strategi Jualan",
    title: "7 Cara Ampuh Meningkatkan Repeat Order dari Pelanggan Lama",
    excerpt:
      "Mendapatkan pelanggan baru biayanya 5x lebih mahal daripada mempertahankan yang sudah ada. Ini 7 cara nyata untuk bikin pelanggan kamu balik beli lagi dan lagi.",
    publishedAt: "2026-05-12",
    readingTime: "7 menit",
    featured: false,
    coverColor: "from-pink-500 to-rose-600",
    sections: [
      {
        paragraphs: [
          "Di dunia marketing ada prinsip yang sudah terbukti berkali-kali: biaya akuisisi pelanggan baru rata-rata 5 kali lebih mahal daripada biaya mempertahankan pelanggan yang sudah ada. Artinya, kalau kamu punya 100 pelanggan yang sudah beli, itu adalah aset yang jauh lebih berharga dari 100 orang yang baru tahu nama toko kamu.",
        ],
      },
      {
        heading: "1. Follow-up setelah pembelian",
        paragraphs: [
          "Kirim pesan WhatsApp 2–3 hari setelah pembeli terima produk. Tanya apakah produk sudah diterima dengan baik, apakah ada pertanyaan soal cara pemakaian, dan ucapkan terima kasih.",
          "Ini bukan spam — ini layanan. Dan ini momen yang tepat untuk minta review atau testimoni juga.",
        ],
        callout: {
          kind: "tip",
          title: "Template follow-up sederhana",
          body: "Halo [nama], terima kasih sudah order [produk] dari kami 😊 Semoga sudah sampai dengan aman ya. Kalau ada pertanyaan atau butuh bantuan, langsung chat sini aja. Senang bisa bantu!",
        },
      },
      {
        heading: "2. Program loyalitas sederhana",
        paragraphs: [
          "Tidak perlu aplikasi khusus. Program paling sederhana: setiap 5 order dapat 1 produk gratis atau diskon X%. Catat di spreadsheet atau di catatan WhatsApp Business.",
          "Yang penting: konsisten dan jelas. Tulis aturannya, dan tepati janji.",
        ],
      },
      {
        heading: "3. Broadcast eksklusif untuk pelanggan lama",
        paragraphs: [
          "Pisahkan daftar broadcast: satu untuk pelanggan yang pernah beli (prioritas), satu untuk prospek. Pelanggan lama dapat info promo lebih awal, stok limited, atau penawaran khusus yang tidak dipublikasikan ke umum.",
          "Ini membuat mereka merasa dihargai — dan orang yang merasa dihargai cenderung loyal.",
        ],
      },
      {
        heading: "4. Reminder stok habis atau musim",
        paragraphs: [
          "Kalau produk kamu ada musimnya (frozen food menjelang Lebaran, hampers natal, produk sekolah menjelang tahun ajaran baru) — ingatkan pelanggan lama sebelum musim tiba.",
          "Atau kalau ada produk yang bisa habis: 'Stok kondisioner rambut yang kamu beli dulu biasanya habis dalam 3 minggu — mau kami siapkan stok berikutnya?'",
        ],
      },
      {
        heading: "5. Bundling khusus untuk pelanggan returning",
        paragraphs: [
          "Buat bundling yang hanya tersedia untuk pelanggan yang sudah pernah beli. Misalnya: beli produk A yang sudah pernah kamu beli + produk B baru dengan harga spesial.",
          "Ini sekaligus cara efektif untuk memperkenalkan produk baru ke pelanggan yang sudah percaya sama kamu.",
        ],
      },
      {
        heading: "6. Minta dan tampilkan testimoni",
        paragraphs: [
          "Testimoni dari pelanggan nyata bukan cuma berguna untuk menarik pembeli baru — tapi juga memperkuat keputusan pelanggan lama untuk beli lagi.",
          "Kalau mereka melihat orang lain puas, dan mereka sendiri juga puas sebelumnya, hambatan untuk repeat order jadi sangat rendah.",
        ],
      },
      {
        heading: "7. Jangan lupa ulang tahun dan momen personal",
        paragraphs: [
          "Kalau kamu tahu tanggal ulang tahun pelanggan (bisa dari percakapan atau formulir order), kirim ucapan sederhana di harinya — tidak perlu promo, cukup ucapan tulus.",
          "Di hari ulang tahun mereka, berikan voucher kecil sebagai hadiah. Ini investasi kecil dengan dampak emosional yang besar.",
        ],
      },
    ],
  },
  {
    slug: "strategi-ongkir-gratis-yang-tepat",
    coverImage: "/blog/strategi-ongkir-gratis-yang-tepat/cover.png",
    category: "Tips Jualan",
    title: "Ongkir Gratis: Strategi Cerdas atau Jebakan untuk Bisnis Kamu?",
    excerpt:
      "Promo 'gratis ongkir' memang menarik pembeli — tapi kalau salah hitung, kamu yang nombok. Ini cara menawarkan ongkir gratis tanpa merusak margin bisnis kamu.",
    publishedAt: "2026-05-14",
    readingTime: "6 menit",
    featured: false,
    coverColor: "from-cyan-500 to-sky-600",
    sections: [
      {
        paragraphs: [
          "Ongkir gratis adalah salah satu insentif paling efektif untuk mendorong pembeli menyelesaikan pembelian. Riset konsisten menunjukkan bahwa 'unexpected shipping cost' adalah alasan nomor satu cart abandonment di toko online.",
          "Tapi di balik itu, banyak seller kecil yang merugi karena menerapkan ongkir gratis tanpa perhitungan matang. Biaya ongkir itu nyata — kalau tidak ditanggung pembeli, harus ditanggung kamu.",
        ],
      },
      {
        heading: "Model 1: Ongkir gratis dengan minimum pembelian",
        paragraphs: [
          "Ini model paling umum dan paling aman. Contoh: 'Gratis ongkir untuk pembelian di atas Rp 150.000'.",
          "Cara hitungnya: cari tahu rata-rata nilai order kamu (average order value/AOV). Set batas minimum ongkir gratis di atas AOV — misalnya 20–30% di atasnya. Ini mendorong pembeli untuk nambah belanja supaya mencapai batas minimum, sekaligus memastikan margin kamu tidak terlalu tergerus.",
        ],
        callout: {
          kind: "tip",
          title: "Cara hitung minimum yang tepat",
          body: "Rata-rata order kamu = Rp 120.000. Rata-rata ongkir = Rp 15.000. Set minimum ongkir gratis di Rp 150.000. Dengan margin produk 40%, keuntungan dari order Rp 150.000 = Rp 60.000 — masih bisa cover ongkir Rp 15.000 dan tetap profit Rp 45.000.",
        },
      },
      {
        heading: "Model 2: Subsidi ongkir bukan gratis penuh",
        paragraphs: [
          "Alih-alih gratis ongkir, kamu bisa subsidi sebagian. Misalnya: 'Ongkir flat Rp 10.000 ke seluruh Indonesia' — padahal ongkir aslinya bisa Rp 15.000–25.000 tergantung kota tujuan.",
          "Kamu menanggung selisihnya, tapi pembeli tetap merasa dapat deal bagus. Dan kamu tidak harus menanggung ongkir penuh.",
        ],
      },
      {
        heading: "Model 3: Ongkir gratis untuk produk tertentu saja",
        paragraphs: [
          "Pilih produk dengan margin tinggi atau produk yang mau kamu push penjualannya, lalu tawarkan ongkir gratis khusus untuk produk itu.",
          "Ini juga berguna untuk produk baru yang ingin kamu kenalkan — ongkir gratis mengurangi risiko pembeli yang masih ragu.",
        ],
      },
      {
        heading: "Kapan ongkir gratis menjadi jebakan?",
        bullets: [
          "Kamu tidak tahu berapa rata-rata ongkir ke pembeli kamu — bisa sangat bervariasi antar kota",
          "Margin produk kamu terlalu tipis untuk menanggung ongkir tambahan",
          "Kamu jual produk berat atau besar — ongkir bisa lebih mahal dari produknya",
          "Kamu tidak set minimum order — sehingga pembeli beli 1 item seharga Rp 20.000 tapi ongkirnya Rp 18.000",
        ],
        callout: {
          kind: "warn",
          title: "Peringatan",
          body: "Jangan ikut-ikutan promo ongkir gratis marketplace tanpa perhitungan. Marketplace bisa subsidi ongkir jutaan rupiah karena mereka punya skala besar. Kamu seller kecil — hitunglah dulu, baru promosikan.",
        },
      },
      {
        heading: "Alternatif yang lebih aman dari ongkir gratis",
        paragraphs: [
          "Kalau margin kamu terlalu tipis untuk ongkir gratis, coba pendekatan lain yang tetap menarik: transparansi ongkir di awal (tidak ada biaya tersembunyi), pengiriman cepat (same day atau next day untuk area terdekat), atau kemasan yang sangat rapi sehingga pembeli merasa harga ongkir worth it.",
        ],
      },
    ],
  },
  {
    slug: "bundling-produk-naikkan-omzet",
    coverImage: "/blog/bundling-produk-naikkan-omzet/cover.png",
    category: "Strategi Jualan",
    title: "Teknik Bundling Produk untuk Naikkan Omzet Tanpa Tambah Stok",
    excerpt:
      "Bundling adalah cara cerdas untuk jual lebih banyak ke pembeli yang sama. Dari paket hemat sampai bundle eksklusif — ini panduan lengkap cara bundling yang efektif untuk UMKM.",
    publishedAt: "2026-05-15",
    readingTime: "7 menit",
    featured: false,
    coverColor: "from-amber-400 to-orange-500",
    sections: [
      {
        paragraphs: [
          "Bayangkan kamu jual sambal kemasan. Harga per botol Rp 25.000. Pembeli biasanya beli 1 botol.",
          "Sekarang kamu tawarkan paket 3 botol seharga Rp 65.000 — hemat Rp 10.000 dari harga satuan. Pembeli pikir mereka dapat deal, dan nilai order kamu naik 2,6x dari transaksi yang sama. Itulah bundling.",
        ],
      },
      {
        heading: "Mengapa bundling efektif?",
        paragraphs: [
          "Bundling bekerja karena beberapa alasan psikologis sekaligus: pembeli merasa dapat nilai lebih dengan harga lebih hemat, pilihan yang lebih sedikit justru mempermudah keputusan beli, dan friction untuk tambah item berkurang (sudah dipaketkan).",
          "Dari sisi bisnis: average order value naik, biaya packing dan pengiriman per item turun (karena dikirim sekaligus), dan stok bergerak lebih cepat.",
        ],
      },
      {
        heading: "Tipe 1: Pure bundle (paket tetap)",
        paragraphs: [
          "Produk dipaketkan jadi satu SKU baru dengan harga khusus. Tidak bisa dibeli satuan di harga paket.",
          "Cocok untuk: produk yang memang sering dipakai bersama (sabun + shampoo, kopi + creamer, buku + alat tulis).",
        ],
        callout: {
          kind: "tip",
          title: "Contoh nyata",
          body: "Warung frozen food: paket 'Starter Minggu Ini' = 10 nugget + 5 dimsum + 5 sosis = Rp 75.000 (hemat Rp 15.000 dari beli satuan). Satu klik, satu transaksi, nilai order 3x lebih besar.",
        },
      },
      {
        heading: "Tipe 2: Mix bundle (pilih sendiri)",
        paragraphs: [
          "Pembeli bisa pilih produk mana yang mau masuk bundle. Misalnya: 'Pilih 3 dari 10 pilihan rasa, bayar harga paket'.",
          "Cocok untuk produk dengan banyak varian (kue kering, sabun handmade dengan banyak aroma, aksesoris dengan banyak warna). Pembeli merasa punya kontrol, tapi kamu tetap jual lebih banyak.",
        ],
      },
      {
        heading: "Tipe 3: Upsell bundle saat checkout",
        paragraphs: [
          "Pembeli sudah mau beli produk A. Di halaman checkout, tawarkan: 'Tambah produk B dengan harga spesial Rp X — biasanya Rp Y'.",
          "Di SellOn, kamu bisa setup ini lewat promo — pembeli akan lihat penawaran tambahan sebelum konfirmasi order.",
        ],
      },
      {
        heading: "Cara hitung harga bundle yang tepat",
        bullets: [
          "Hitung HPP total semua produk dalam bundle",
          "Berikan diskon 10–20% dari harga satuan total (jangan lebih dari margin kamu)",
          "Pastikan margin bundle masih di atas minimal yang kamu butuhkan",
          "Komunikasikan penghematan dengan jelas: 'Hemat Rp X' lebih kuat dari 'Diskon 15%'",
        ],
      },
    ],
  },
  {
    slug: "kelola-pesanan-online-tanpa-stres",
    coverImage: "/blog/kelola-pesanan-online-tanpa-stres/cover.png",
    category: "Operasional",
    title: "Cara Kelola Pesanan Online Biar Tidak Ada yang Kelewatan",
    excerpt:
      "Satu pesanan yang ketinggalan bisa merusak kepercayaan pelanggan yang dibangun berbulan-bulan. Ini sistem sederhana untuk kelola order yang bisa kamu terapkan hari ini.",
    publishedAt: "2026-05-16",
    readingTime: "6 menit",
    featured: false,
    coverColor: "from-slate-500 to-zinc-700",
    sections: [
      {
        paragraphs: [
          "Keluhan paling sering dari pembeli online bukan soal harga — tapi soal pesanan yang tidak diproses, tidak dikabari, atau lambat dikirim. Dan ironisnya, kebanyakan masalah ini bukan karena seller tidak mau — tapi karena sistemnya tidak ada.",
          "Dengan sistem yang tepat, kamu bisa handle lebih banyak pesanan dengan lebih sedikit stres.",
        ],
      },
      {
        heading: "Langkah 1: Satu tempat untuk semua pesanan",
        paragraphs: [
          "Masalah terbesar seller yang terima order dari banyak channel (WhatsApp, DM Instagram, marketplace, dll): pesanan tersebar di mana-mana. Solusinya: pilih satu 'command center'.",
          "Kalau kamu pakai SellOn, semua order masuk ke dashboard dan kamu dapat notifikasi real-time. Kalau masih manual, buat satu spreadsheet atau Trello board yang jadi satu-satunya tempat kamu tracking order.",
        ],
        callout: {
          kind: "tip",
          title: "Prinsip satu pintu",
          body: "Satu sumber kebenaran untuk semua pesanan. Tidak ada yang dicatat di notes HP, sebagian di buku, sebagian di chat. Semua masuk ke satu tempat — baru prosesnya bisa diorganisir.",
        },
      },
      {
        heading: "Langkah 2: Status yang jelas untuk setiap pesanan",
        paragraphs: [
          "Buat status yang jelas: Baru Masuk → Dikonfirmasi → Diproses → Dikemas → Dikirim → Selesai. Setiap pesanan harus punya status yang ter-update.",
          "Di SellOn, status ini sudah ter-build in dan bisa di-update langsung dari dashboard — pembeli juga bisa lihat status ordernya secara real-time.",
        ],
        bullets: [
          "Baru Masuk: order diterima, belum dikonfirmasi pembayaran",
          "Dikonfirmasi: pembayaran sudah terverifikasi",
          "Diproses: sedang disiapkan / diproduksi",
          "Dikemas: sudah siap kirim, menunggu pickup kurir",
          "Dikirim: sudah ada nomor resi",
          "Selesai: pembeli konfirmasi terima / tidak ada komplain",
        ],
      },
      {
        heading: "Langkah 3: Jadwal proses yang konsisten",
        paragraphs: [
          "Tetapkan jam operasional yang jelas: order masuk sebelum jam 12.00 diproses hari itu, setelah jam 12.00 diproses keesokan harinya. Ini bukan soal tidak mau cepat — ini soal manajemen ekspektasi.",
          "Komunikasikan ini di profil toko dan di pesan otomatis WhatsApp. Pembeli yang tahu ekspektasinya jauh lebih sabar daripada pembeli yang tidak tahu kapan pesanannya diproses.",
        ],
      },
      {
        heading: "Langkah 4: Template pesan untuk setiap tahap",
        paragraphs: [
          "Siapkan template pesan WhatsApp untuk setiap update: konfirmasi order, konfirmasi pembayaran, notifikasi pengiriman (dengan nomor resi), dan ucapan terima kasih setelah produk sampai.",
          "Setup sebagai Quick Reply di WhatsApp Business. Dengan ini, update status pembeli cukup 30 detik per orang.",
        ],
      },
    ],
  },
  {
    slug: "testimoni-pelanggan-untuk-jualan",
    coverImage: "/blog/testimoni-pelanggan-untuk-jualan/cover.png",
    category: "Strategi Jualan",
    title: "Cara Kumpulkan dan Manfaatkan Testimoni Pelanggan untuk Jualan",
    excerpt:
      "92% pembeli online membaca ulasan sebelum beli. Testimoni yang baik adalah tenaga penjual yang kerja 24 jam tanpa gaji. Ini cara sistematis untuk mengumpulkan dan menggunakannya.",
    publishedAt: "2026-05-17",
    readingTime: "6 menit",
    featured: false,
    coverColor: "from-green-500 to-teal-500",
    sections: [
      {
        paragraphs: [
          "Tidak ada marketing yang lebih kuat dari pelanggan yang puas bercerita ke orang lain. Dan di era digital, 'cerita ke orang lain' itu bentuknya adalah ulasan, testimoni, dan rekomendasi yang bisa dibaca ratusan calon pembeli.",
          "Masalahnya: banyak seller yang tidak punya sistem untuk mengumpulkan testimoni. Hasilnya, banyak pelanggan puas yang tidak pernah meninggalkan ulasan — bukan karena tidak mau, tapi karena tidak diminta.",
        ],
      },
      {
        heading: "Kapan dan bagaimana meminta testimoni",
        paragraphs: [
          "Timing terbaik: 2–4 hari setelah pembeli terima produk. Cukup waktu untuk mereka coba produknya, tapi belum terlalu lama sehingga euforia pembelian sudah memudar.",
          "Cara paling efektif: WhatsApp personal, bukan broadcast massal. Pesan personal terasa lebih tulus dan tingkat responsnya jauh lebih tinggi.",
        ],
        callout: {
          kind: "tip",
          title: "Template minta testimoni yang efektif",
          body: "Halo [nama] 😊 Gimana [produk]-nya, sudah dicoba? Kalau ada feedback atau foto pakai produknya, boleh banget share ke kami — jadi semangat banget dengernya dan berguna untuk seller kecil kayak kami. Terima kasih banyak ya sudah percaya belanja di sini!",
        },
      },
      {
        heading: "Format testimoni yang paling kuat untuk konversi",
        paragraphs: [
          "Bukan semua testimoni dibuat sama. Testimoni yang paling memengaruhi keputusan beli adalah yang spesifik, real, dan punya konteks.",
        ],
        bullets: [
          "Spesifik: 'Sambalnya enak banget' kurang kuat vs 'Sambalnya pas banget levelnya, tidak terlalu pedas, beli tiap minggu'",
          "Punya foto: produk asli yang difoto pembeli jauh lebih dipercaya dari foto produk profesional",
          "Ada konteks: pembeli yang bercerita untuk apa mereka beli produk kamu membantu calon pembeli yang situasinya mirip untuk relate",
          "Selesaikan objeksi: testimoni yang nyebutin 'tadinya ragu tapi ternyata...' sangat powerful",
        ],
      },
      {
        heading: "Di mana tampilkan testimoni",
        bullets: [
          "Halaman produk di toko online kamu — pembeli cek ini sebelum checkout",
          "Story dan highlight Instagram — buat highlight khusus 'Testimoni'",
          "Pesan broadcast — sertakan 1–2 testimoni relevan saat kamu promosikan produk",
          "Status WhatsApp — testimoni dalam bentuk screenshot (dengan izin) sangat efektif",
          "Di foto produk ke-5 atau ke-6 — ada pembeli yang beli dari foto testimoni saja",
        ],
      },
      {
        heading: "Testimoni negatif — jangan takut",
        paragraphs: [
          "Feedback negatif yang ditangani dengan baik justru bisa menjadi salah satu marketing paling efektif. Respons yang cepat, empati, dan solusi nyata memberi sinyal ke calon pembeli bahwa kamu seller yang bertanggung jawab.",
          "Riset menunjukkan bahwa toko dengan rating sempurna 5/5 justru kadang terlihat kurang kredibel. Campuran rating yang realistis dengan respons baik terhadap ulasan negatif justru membangun kepercayaan.",
        ],
        callout: {
          kind: "warn",
          title: "Jangan lakukan ini",
          body: "Jangan bayar atau minta teman untuk buat testimoni palsu. Pembeli semakin jeli membedakan testimoni asli dan palsu. Satu skandal testimoni palsu bisa menghancurkan kepercayaan yang dibangun bertahun-tahun.",
        },
      },
    ],
  },
];

// Marketing/strategy posts first, then product tutorials (with screenshots).
export const blogPosts: BlogPost[] = [...marketingPosts, ...tutorialPosts];

export function findPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function relatedPosts(current: BlogPost, n = 3): BlogPost[] {
  const sameCategory = blogPosts.filter(
    (p) => p.slug !== current.slug && p.category === current.category,
  );
  const others = blogPosts.filter(
    (p) => p.slug !== current.slug && p.category !== current.category,
  );
  return [...sameCategory, ...others].slice(0, n);
}
