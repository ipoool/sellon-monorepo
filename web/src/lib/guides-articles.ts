// Static panduan content. Authored in Bahasa Indonesia for UMKM
// readers. Body is broken into sections (heading + paragraphs/bullets)
// so the renderer stays simple — no Markdown parser dependency.

type ArticleSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: { kind: "tip" | "warn"; title: string; body: string };
};

type Article = {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  readingTime: string;
  sections: ArticleSection[];
};

export const articles: Article[] = [
  {
    slug: "mulai-jualan-online-tanpa-modal-besar",
    category: "Pemula",
    title: "Cara mulai jualan online tanpa modal besar",
    excerpt:
      "Bukan tentang seberapa banyak modal, tapi seberapa cepat kamu bisa eksekusi. Panduan praktis untuk UMKM yang baru mulai.",
    readingTime: "8 menit",
    sections: [
      {
        paragraphs: [
          "Banyak yang menunda jualan online karena merasa belum punya modal cukup. Padahal, kalau dipecah, modal yang benar-benar wajib jauh lebih kecil dari yang dibayangkan. Yang penting: produk yang jelas, satu kanal komunikasi, dan kemampuan kirim ke alamat pembeli.",
        ],
      },
      {
        heading: "1. Mulai dari produk yang sudah kamu kuasai",
        paragraphs: [
          "Pilih produk yang sudah kamu pahami atau punya akses sumbernya. Kalau kamu sudah punya warung makan, mulailah dari paket frozen yang tahan kirim. Kalau kamu suka kerajinan tangan, jual yang sudah pernah kamu buat untuk teman.",
          "Jangan latah ikut tren. Tren cepat lewat — tapi keterampilanmu tetap.",
        ],
      },
      {
        heading: "2. Modal awal yang sebenarnya",
        bullets: [
          "Stok awal: secukupnya untuk 5–10 pesanan pertama. Jangan beli kemasan 1.000 pcs sebelum tahu produk laku.",
          "Kemasan: bubble wrap atau kardus bekas dulu boleh, sambil cari supplier yang lebih rapi.",
          "Pulsa & data: anggaran tetap kecil — pelangganmu nanti yang bayar bensin promosi via word of mouth.",
        ],
      },
      {
        heading: "3. Pakai kanal yang sudah ada audiensnya",
        paragraphs: [
          "WhatsApp, Instagram, TikTok — pilih satu yang paling kamu sering buka. Lebih baik fokus di satu kanal yang aktif daripada bikin akun di lima tempat dan tidak terurus.",
          "SellOn dirancang biar kamu cukup share satu link katalog ke tiap kanal — pembeli langsung lihat produk + checkout, tanpa kamu harus jadi katalog hidup.",
        ],
      },
      {
        heading: "4. Tetapkan harga yang masuk akal sejak hari pertama",
        paragraphs: [
          "Banyak UMKM rugi karena lupa hitung biaya kemasan, bensin antar, atau biaya transfer. Catat semua biaya — termasuk waktu kerjamu — sebelum tetapkan harga jual.",
        ],
        callout: {
          kind: "tip",
          title: "Aturan praktis",
          body: "Harga jual minimal = (harga modal + ongkos produksi + kemasan) × 1.5. Kalau bisa lebih, lebih baik — pelanggan setia tidak hanya cari yang termurah.",
        },
      },
      {
        heading: "5. Eksekusi 7 hari, evaluasi minggu kedua",
        paragraphs: [
          "Set deadline untuk dirimu sendiri: minggu pertama upload produk + share ke 3 grup WhatsApp / status story. Minggu kedua, lihat: berapa yang lihat, berapa yang tanya, berapa yang beli. Dari angka itu kamu bisa tahu apa yang perlu diubah — foto, harga, atau produknya sendiri.",
        ],
      },
    ],
  },
  {
    slug: "foto-produk-pakai-hp",
    category: "Foto Produk",
    title: "5 trik foto produk pakai HP yang bikin laris",
    excerpt:
      "Tidak perlu kamera DSLR. Cuma butuh cahaya pagi, latar polos, dan komposisi yang tepat — plus contoh praktis.",
    readingTime: "5 menit",
    sections: [
      {
        paragraphs: [
          "Pembeli online tidak bisa pegang produk. Foto adalah satu-satunya cara mereka kenal produkmu. Untungnya, semua HP keluaran 5 tahun terakhir sudah cukup bagus — yang penting cara pakainya.",
        ],
      },
      {
        heading: "1. Pakai cahaya jendela jam 8–10 pagi",
        paragraphs: [
          "Cahaya alami pagi adalah lampu studio gratis. Letakkan produk di meja dekat jendela, biarkan cahaya datang dari samping. Hindari sinar matahari langsung — bayangan jadi keras.",
          "Jangan pakai flash HP. Flash bikin warna jadi pucat dan bayangan jelek.",
        ],
      },
      {
        heading: "2. Latar belakang: putih atau polos",
        paragraphs: [
          "Karton putih, kain putih, atau dinding rumah yang dicat polos — semua bekerja. Latar yang ramai (kayu motif, marmer berbintik) menarik perhatian dari produk.",
          "Untuk produk gelap (kopi, batu hitam), kadang latar abu-abu lembut malah lebih bagus daripada putih supaya tepi produk tidak hilang.",
        ],
      },
      {
        heading: "3. Komposisi 'rule of thirds'",
        paragraphs: [
          "Aktifkan grid di kamera HP. Letakkan produk di salah satu titik perpotongan grid — bukan di tengah persis. Mata kita lebih nyaman lihat foto seperti ini.",
        ],
      },
      {
        heading: "4. Ambil 3 sudut: depan, atas, detail",
        bullets: [
          "Depan: sudut yang paling 'menjual', biasanya pas mata kamera sejajar produk.",
          "Atas (flat lay): bagus untuk produk yang punya banyak komponen, seperti makanan paket atau set kerajinan.",
          "Detail: zoom ke tekstur, jahitan, atau motif — meyakinkan pembeli bahwa kualitasnya nyata.",
        ],
      },
      {
        heading: "5. Editing minimal: terang + crop",
        paragraphs: [
          "Pakai aplikasi edit bawaan HP atau Snapseed gratis. Naikkan terang sedikit, naikkan kontras tipis, crop biar produk dominan. Hindari filter warna berlebihan — pembeli kecewa kalau warna asli berbeda dari foto.",
        ],
        callout: {
          kind: "warn",
          title: "Hati-hati filter",
          body: "Foto kuning hangat memang aesthetic, tapi kalau produkmu putih beneran, pembeli akan komplain ‘kenapa beda?’. Konsistensi warna jauh lebih penting daripada estetika.",
        },
      },
    ],
  },
  {
    slug: "whatsapp-broadcast-tidak-menyebalkan",
    category: "Pemasaran",
    title: "Strategi WhatsApp Broadcast yang tidak menyebalkan",
    excerpt:
      "Cara kirim broadcast ke pelanggan tanpa membuat mereka block. Frekuensi, timing, dan template yang berhasil.",
    readingTime: "6 menit",
    sections: [
      {
        paragraphs: [
          "WhatsApp Broadcast itu ibarat mengetuk pintu rumah pelanggan. Kalau kamu ngetuk tiap hari sambil teriak promo, pintu akan ditutup. Tapi kalau hanya sesekali dan bawa kabar yang bermanfaat, mereka senang lihat kamu datang.",
        ],
      },
      {
        heading: "Aturan #1: hanya kirim ke yang sudah pernah beli",
        paragraphs: [
          "Broadcast ke kontak random hanya menambah orang yang block kamu. Pelanggan yang pernah transaksi sudah punya konteks — mereka tahu siapa kamu dan kenapa kamu kirim chat.",
          "Tip praktis: setelah pesanan selesai, tanyakan kabarnya 1–2 hari kemudian. Itu kesempatan untuk konfirmasi mereka mau dapat info promo selanjutnya atau tidak.",
        ],
      },
      {
        heading: "Aturan #2: maksimal 1× per minggu, idealnya 1× per 2 minggu",
        paragraphs: [
          "Frekuensi terlalu sering bikin pesanmu jadi noise. Kalau kamu broadcast tiap hari, pelanggan akan mute / archive / block. Sekali per dua minggu adalah ritme yang aman — cukup ingat-ingat tanpa mengganggu.",
        ],
      },
      {
        heading: "Aturan #3: konten harus berguna, bukan cuma diskon",
        bullets: [
          "Update stok produk yang sebelumnya habis ('Kaos size M sudah ready lagi').",
          "Tips singkat seputar produkmu ('Cara simpan sambal botol biar tahan 3 minggu').",
          "Cerita di balik produk baru ('Kemarin saya ketemu petani kopi di Toraja, hasilnya...').",
          "Promo memang oke — tapi maksimal 1 dari 3 broadcast. Sisanya berisi nilai.",
        ],
      },
      {
        heading: "Template broadcast yang berhasil",
        paragraphs: [
          "Salin dan sesuaikan dengan toko-mu:",
        ],
        callout: {
          kind: "tip",
          title: "Contoh broadcast pengingat",
          body: "Halo Kak {nama_pelanggan}! 👋\n\nKemarin Kakak pernah pesan {produk_terakhir}. Kebetulan minggu ini stoknya baru datang lagi & ada bonus tas kain untuk pembelian di atas Rp 100rb.\n\nKalau berminat, link katalognya tetap di sini: {link_toko}\n\nKalau tidak butuh, abaikan saja ya — tidak masalah 🙏",
        },
      },
      {
        heading: "Aturan #4: hormati waktu mereka",
        paragraphs: [
          "Hindari kirim sebelum jam 9 pagi atau setelah jam 8 malam. Hari Senin pagi (sibuk) dan Sabtu malam (santai keluarga) juga kurang ideal. Selasa–Jumat antara jam 10–11 atau 14–16 adalah window yang paling responsif untuk UMKM.",
        ],
      },
    ],
  },
  {
    slug: "hitung-hpp-makanan",
    category: "Penetapan Harga",
    title: "Cara hitung HPP produk makanan dengan benar",
    excerpt:
      "Banyak UMKM kuliner tampak laris tapi merugi diam-diam. Akar masalahnya: HPP tidak dihitung lengkap. Ini cara hitungnya step-by-step.",
    readingTime: "7 menit",
    sections: [
      {
        paragraphs: [
          "Harga Pokok Produksi (HPP) bukan cuma harga bahan baku. Banyak UMKM keliru menyamakannya, lalu menetapkan harga jual yang seolah untung — padahal setelah dipotong biaya tetap, sisa untungnya tipis.",
        ],
      },
      {
        heading: "Komponen HPP yang sering dilupakan",
        bullets: [
          "Bahan baku langsung (tepung, bumbu, dst.) — yang paling mudah dihitung.",
          "Bahan pendukung: minyak goreng, gas, listrik, air. Bagi total tagihan ke jumlah porsi sebulan.",
          "Kemasan: plastik, sticker, dus, sendok. Tiap pesanan pakai berapa banyak?",
          "Tenaga kerja: termasuk dirimu sendiri. Hitung jam kerjamu × upah minimum lokal per jam.",
          "Penyusutan alat: kompor, freezer, blender. Bagi harga belinya ke umur pakai (mis. 3 tahun) lalu ke jumlah porsi.",
        ],
      },
      {
        heading: "Contoh perhitungan: rendang 1 porsi",
        paragraphs: [
          "Misal kamu jual rendang frozen 250 gram:",
        ],
        bullets: [
          "Daging sapi (250g): Rp 35.000",
          "Bumbu lengkap (santan, cabai, dst.): Rp 5.000",
          "Gas + listrik per porsi (rata-rata): Rp 1.500",
          "Kemasan vakum + sticker: Rp 3.500",
          "Tenaga kerja per porsi (10 menit × Rp 25.000/jam): Rp 4.200",
          "Penyusutan alat per porsi: Rp 800",
          "TOTAL HPP: Rp 50.000",
        ],
      },
      {
        heading: "Margin yang sehat untuk makanan",
        paragraphs: [
          "Industri kuliner umumnya pakai margin 30–50% di atas HPP. Untuk produk premium atau niche, bisa sampai 100%. Jangan tergiur jual murah dengan margin 10% — kamu akan kehabisan napas saat ada bahan baku naik atau kompetitor diskon.",
          "Pakai contoh di atas: HPP Rp 50.000 → harga jual minimal Rp 65.000 (margin 30%), ideal Rp 75.000 (margin 50%).",
        ],
        callout: {
          kind: "warn",
          title: "Sering keliru",
          body: "Ongkir bukan bagian dari HPP — itu biaya yang ditanggung pembeli (atau kamu kalau gratis ongkir). Kalau kamu masukkan ongkir ke HPP, harga jualmu jadi tidak bersaing.",
        },
      },
      {
        heading: "Hitung ulang setiap 3 bulan",
        paragraphs: [
          "Harga bahan naik diam-diam. Kalau kamu tidak pernah review HPP, satu hari kamu sadar margin sudah kemakan. Buat reminder kalender per kuartal — luangkan 30 menit untuk update angka.",
        ],
      },
    ],
  },
  {
    slug: "template-balasan-whatsapp",
    category: "Customer Service",
    title: "Template balasan WhatsApp untuk pesanan masuk",
    excerpt:
      "Kalau respon-mu lambat atau berantakan, pembeli kabur. Template ini hemat waktu sekaligus terasa ramah.",
    readingTime: "5 menit",
    sections: [
      {
        paragraphs: [
          "Setiap detik delay menunda kepercayaan. Tapi tidak semua pesan harus kamu ketik dari nol — siapkan template untuk skenario yang berulang, lalu ubah secukupnya tiap chat.",
        ],
      },
      {
        heading: "1. Sapaan pertama (pembeli baru)",
        callout: {
          kind: "tip",
          title: "Template",
          body: "Halo Kak! 👋 Selamat datang di {nama_toko}.\n\nProduk yang Kakak tanyakan masih ready ya. Boleh saya bantu rekomendasi atau ada yang spesifik mau ditanyakan?",
        },
      },
      {
        heading: "2. Konfirmasi pesanan masuk",
        callout: {
          kind: "tip",
          title: "Template",
          body: "Pesanan Kak {nama_pelanggan} sudah saya catat ya:\n\n{ringkasan_produk}\n\nTotal yang harus ditransfer: {total}\nKe rekening: {rekening}\n\nKalau sudah transfer, konfirmasi di sini ya — saya proses langsung.",
        },
      },
      {
        heading: "3. Update saat barang sudah dikirim",
        callout: {
          kind: "tip",
          title: "Template",
          body: "Halo Kak {nama_pelanggan}! Pesanannya sudah saya kirim hari ini via {kurir} 📦\n\nNo. resi: {resi}\nEstimasi sampai: {estimasi}\n\nNanti saya kabarin lagi pas sudah sampai ya. Kalau ada kendala, langsung chat saya.",
        },
      },
      {
        heading: "4. Balasan saat stok kosong",
        paragraphs: [
          "Hindari ‘sorry kosong’ tanpa solusi — pelanggan kecewa lalu lupa kembali. Tawarkan alternatif:",
        ],
        callout: {
          kind: "tip",
          title: "Template",
          body: "Wah maaf banget Kak, untuk varian {warna/ukuran} stok lagi kosong sampai {tanggal}.\n\nKalau Kakak mau, ada 2 opsi:\n1. Saya catat dulu — nanti saya kabarin pas restock.\n2. Ada varian {alternatif_serupa} yang spec-nya mirip, mau saya kirim foto bandinginnya?\n\nGimana enaknya?",
        },
      },
      {
        heading: "5. Handle komplain dengan empati",
        paragraphs: [
          "Komplain yang ditangani baik justru bikin pelanggan lebih loyal. Pakai pola: dengarkan → minta maaf → tawarkan solusi konkret → tindak lanjut.",
        ],
        callout: {
          kind: "tip",
          title: "Template",
          body: "Halo Kak, saya benar-benar minta maaf atas pengalaman ini. Saya mengerti kecewanya — kalau saya yang terima paket seperti itu juga pasti kesal.\n\nUntuk gantinya, saya bisa kirim ulang produk gratis ongkir, atau refund 100%. Mana yang lebih nyaman buat Kakak?\n\nTerima kasih sudah mau kasih kesempatan kami perbaiki.",
        },
      },
    ],
  },
  {
    slug: "bedanya-kurir-jne-jnt-sicepat",
    category: "Pengiriman",
    title: "Bedanya JNE, J&T, SiCepat — mana yang paling cocok untuk UMKM-mu?",
    excerpt:
      "Tiap kurir punya karakter beda. Ini ringkasan jujur kelebihan-kekurangan masing-masing untuk membantu kamu pilih.",
    readingTime: "6 menit",
    sections: [
      {
        paragraphs: [
          "Tidak ada satu kurir yang ‘paling baik’. Ada kurir yang murah tapi lambat, ada yang cepat tapi mahal, ada yang jangkauannya luas, ada yang khusus kota besar. Kenali karakter masing-masing biar kamu bisa kombinasi sesuai pesanan.",
        ],
      },
      {
        heading: "JNE — yang paling lengkap, paling mahal",
        bullets: [
          "Jangkauan terluas: pelosok desa pun ada agennya.",
          "Layanan: REG (3–5 hari), YES (next day), OKE (4–7 hari, lebih murah).",
          "Cocok: pesanan ke daerah terpencil, paket bernilai tinggi (asuransi otomatis di YES).",
          "Kekurangan: tarif paling tinggi, sistem tracking kadang lambat update.",
        ],
      },
      {
        heading: "J&T Express — cepat & relatif murah",
        bullets: [
          "Jangkauan luas, tarif sering termurah di antara 3 ini.",
          "Layanan utama EZ (2–4 hari, dalam pulau Jawa).",
          "Cocok: volume tinggi, pesanan ke kota & kabupaten utama.",
          "Kekurangan: kualitas handling agak variatif per kota — ada yang rapi, ada yang asal lempar.",
        ],
      },
      {
        heading: "SiCepat — pilihan e-commerce, banyak promo",
        bullets: [
          "Tarif sangat kompetitif, sering ada promo gratis ongkir mitra.",
          "Layanan: REG (2–3 hari), BEST (next day di kota tertentu).",
          "Cocok: UMKM yang dropship dari marketplace, pesanan reguler dalam Pulau Jawa.",
          "Kekurangan: jangkauan ke pelosok lebih terbatas dari JNE.",
        ],
      },
      {
        heading: "Bagaimana memilihnya?",
        paragraphs: [
          "Pertimbangkan 3 hal: tujuan pengiriman (kota besar atau pelosok?), nilai produk (mahal butuh asuransi?), dan ekspektasi pembeli (cepat/biasa).",
        ],
        callout: {
          kind: "tip",
          title: "Strategi praktis",
          body: "Aktifkan minimal 2 kurir di pengaturan SellOn. Beri pembeli pilihan saat checkout — mereka yang tahu daerahnya paling cocok dilayani siapa.",
        },
      },
      {
        heading: "Tips packing untuk semua kurir",
        bullets: [
          "Bubble wrap minimal 2 lapis untuk barang pecah belah.",
          "Sticker ‘FRAGILE’ besar — meskipun kurir tidak selalu peduli, minimal jadi pengingat saat handling.",
          "Untuk makanan basah/cair, double seal + plastik luar bening biar bocor terdeteksi sebelum tabrakan.",
          "Foto barang sebelum dikemas. Kalau ada klaim, foto ini kunci.",
        ],
      },
    ],
  },
];

export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
