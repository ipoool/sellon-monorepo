import {
  ShoppingBag,
  Receipt,
  QrCode,
  Users,
  GraduationCap,
  Boxes,
  type LucideIcon,
} from "lucide-react";

/**
 * The six product areas the home page offers as entry points.
 *
 * One list, read by both the hero's chip row and the feature explorer below
 * it, because the chips scroll to a panel that must describe the same thing
 * the chip promised. Two lists would drift the first time one was edited.
 *
 * `key` is the URL hash the chips target (`#fitur-kasir-pos`).
 */
export type HomeFeature = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Tailwind class for the icon chip's fill — SellOn semantic hues only. */
  chip: string;
  /** Pale wash behind the detail panel, same hue family as `chip`. */
  tint: string;
  /** Text colour for the illustration's accent and the active tab. */
  accent: string;
  headline: string;
  body: string;
  points: string[];
};

export const HOME_FEATURES: HomeFeature[] = [
  {
    key: "toko-online",
    label: "Toko Online",
    icon: ShoppingBag,
    chip: "bg-brand-500",
    accent: "text-brand-600",
    tint: "bg-brand-50",
    headline: "Toko yang alamatnya milikmu sendiri.",
    body: "Bagikan satu link ke pembeli — lewat WhatsApp, Instagram, atau bio TikTok. Mereka pilih produk, isi alamat, dan bayar sendiri tanpa kamu catat manual.",
    points: [
      "Sepuluh tampilan storefront, termasuk halaman depan yang bisa kamu susun sendiri",
      "Ongkir otomatis dari kurir, atau kamu tentukan sendiri",
      "Pembeli bisa lacak status pesanannya tanpa perlu akun",
    ],
  },
  {
    key: "kasir-pos",
    label: "Kasir POS",
    icon: Receipt,
    chip: "bg-info",
    accent: "text-info",
    tint: "bg-info/10",
    headline: "Satu katalog untuk toko online dan kasir.",
    body: "Jual di konter pakai mode kasir, dan stoknya ikut terpotong di toko online yang sama. Tidak ada dua sistem yang saling berbeda angka.",
    points: [
      "Tetap jalan waktu internet mati — transaksi tersinkron begitu sinyal kembali",
      "Struk printer Bluetooth, split payment, dan tutup shift dengan rekap kas",
      "Kembalian, void, dan retur ikut tercatat di laporan yang sama",
    ],
  },
  {
    key: "pesan-di-meja",
    label: "Pesan di Meja",
    icon: QrCode,
    chip: "bg-warning",
    accent: "text-warning",
    tint: "bg-warning/10",
    headline: "Pembeli pesan sendiri dari mejanya.",
    body: "Tempel QR di tiap meja. Pembeli scan, pilih dine-in atau bawa pulang, lalu pesan dari HP mereka sendiri — pesanannya langsung masuk ke dapur.",
    points: [
      "Layar dapur (KDS) dengan antrian dan status per pesanan",
      "Nomor antrian otomatis, lengkap dengan layar tunggu untuk pembeli",
      "Ukuran, topping, dan catatan ikut terbawa ke dapur",
    ],
  },
  {
    key: "program-reseller",
    label: "Program Reseller",
    icon: Users,
    chip: "bg-info",
    accent: "text-info",
    tint: "bg-info/10",
    headline: "Jaringan penjual yang jualan untukmu.",
    body: "Beri harga khusus ke reseller dan dropshipper, lalu pantau siapa yang benar-benar menjual — tanpa rekap manual tiap bulan.",
    points: [
      "Harga dan margin berbeda per program",
      "Katalog khusus reseller yang bisa mereka bagikan ulang",
      "Pesanan tiap anggota terpisah di laporanmu",
    ],
  },
  {
    key: "kelas-online",
    label: "Kelas Online",
    icon: GraduationCap,
    chip: "bg-danger",
    accent: "text-danger",
    tint: "bg-danger/10",
    headline: "Jual ilmu, bukan cuma barang.",
    body: "Unggah video kelas atau file digital. Pembeli dapat akses terkunci lewat email mereka sendiri, dengan masa aktif yang kamu tentukan.",
    points: [
      "Akses dikunci per pembeli, bukan link yang bisa diteruskan",
      "Masa aktif: selamanya, atau hitungan minggu/bulan/tahun",
      "File digital terkirim otomatis begitu pembayaran lunas",
    ],
  },
  {
    key: "stok-bahan-baku",
    label: "Stok & Bahan Baku",
    icon: Boxes,
    chip: "bg-brand-500",
    accent: "text-brand-600",
    tint: "bg-brand-50",
    headline: "Tahu modalmu, bukan cuma omzetmu.",
    body: "Susun resep tiap produk dari bahan baku. Tiap penjualan memotong bahannya, jadi kamu tahu HPP sebenarnya dan kapan harus belanja lagi.",
    points: [
      "Resep per produk dan per pilihan (ukuran, topping)",
      "Purchase order dan stock opname untuk mencocokkan fisik",
      "Peringatan stok menipis sebelum kehabisan",
    ],
  },
];
