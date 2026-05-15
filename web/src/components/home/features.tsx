import {
  Store,
  CreditCard,
  ClipboardList,
  Users,
  Megaphone,
  BarChart3,
  Upload,
  Download,
  Truck,
  Sparkles,
  Check,
  type LucideIcon,
} from "lucide-react";

import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";

type Feature = {
  icon: LucideIcon;
  title: string;
  tagline: string;
  bullets: string[];
  // Tailwind tint for the icon container - kept inside the brand family but
  // varied so the grid doesn't feel monotonous.
  iconBg: string;
  iconFg: string;
};

const features: Feature[] = [
  {
    icon: Store,
    title: "Toko sendiri, cukup kirim link-nya",
    tagline:
      "Halaman toko siap dipakai dalam menit - tinggal kirim link-nya ke grup WA atau bio Instagram, pembeli langsung lihat seluruh katalog.",
    bullets: [
      "Pembeli scroll & cari produk dengan mudah dari HP",
      "Produk paling laku tampil paling atas",
      "Tombol order WhatsApp cukup sekali ketuk",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: CreditCard,
    title: "Terima bayaran dengan cara apa pun",
    tagline:
      "QRIS, transfer bank, GoPay, ShopeePay - pembeli tinggal scan atau klik, uangnya langsung masuk ke rekening kamu.",
    bullets: [
      "Pembayaran QRIS, transfer, GoPay, ShopeePay",
      "Coba dulu di mode test sebelum diaktifkan",
      "Notifikasi otomatis pas pembeli selesai bayar",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: ClipboardList,
    title: "Kelola pesanan dari satu layar",
    tagline:
      "Dari order masuk sampai paket diterima pembeli - semua status pesanan tercatat rapi. Tidak perlu lagi catat manual di buku.",
    bullets: [
      "Status jelas: baru, diproses, dikirim, atau selesai",
      "Masukkan nomor resi langsung dari HP",
      "Unduh semua pesanan jadi file Excel kapan saja",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Upload,
    title: "Tambah produk banyak sekaligus",
    tagline:
      "Punya ratusan produk? Upload sekali jalan dari file Excel - selesai dalam 5 menit, bukan seharian.",
    bullets: [
      "Foto produk langsung dari HP",
      "Satu produk bisa banyak ukuran atau warna",
      "Notifikasi otomatis kalau stok mau habis",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Truck,
    title: "Cocok untuk barang fisik",
    tagline:
      "Kaos, makanan, kerajinan - apa pun yang dikirim ke alamat pembeli, pengiriman & ongkir-nya tinggal pilih.",
    bullets: [
      "Pilih kurir (JNE, J&T, SiCepat, dll.) langsung di checkout",
      "Ongkir hitung otomatis berdasarkan kota tujuan",
      "Cetak label & input nomor resi tanpa pindah aplikasi",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Download,
    title: "Cocok juga untuk produk digital",
    tagline:
      "Ebook, kursus, voucher, atau template - file langsung sampai ke pembeli setelah pembayaran lunas, tanpa kamu repot kirim manual.",
    bullets: [
      "Pembeli digital tidak perlu isi alamat",
      "Link akses otomatis dikirim ke email pembeli",
      "Aman - link punya token unik, tidak bisa dibagi-bagi",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Users,
    title: "Daftar pelanggan tercatat otomatis",
    tagline:
      "Setiap pembeli langsung masuk daftar tanpa kamu input manual. Lama-lama kamu tahu mana langganan setia, mana yang baru kenal.",
    bullets: [
      "Pelanggan baru, loyal, atau VIP otomatis ditandai",
      "Tulis catatan kecil di tiap pelanggan",
      "Chat ulang pelanggan langsung dari dasbor",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Megaphone,
    title: "Bikin promo gampang",
    tagline:
      "Kode diskon, gratis ongkir, atau potongan harga - pakai cara apa pun untuk bikin pelanggan balik lagi.",
    bullets: [
      "Atur minimum belanja & batas pemakaian kode",
      "Tentukan tanggal mulai dan kapan promo habis",
      "Pembeli tinggal masukkan kode pas checkout",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: BarChart3,
    title: "Pantau performa toko sekejap",
    tagline:
      "Penjualan harian, produk paling laku, pelanggan paling loyal - semua di satu halaman, tanpa perlu hitung manual.",
    bullets: [
      "Grafik pendapatan harian yang mudah dibaca",
      "Tahu produk mana yang paling laku",
      "Bandingkan performa 7, 30, atau 90 hari terakhir",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Sparkles,
    title: "Bayar tetap per bulan, bukan per pesanan",
    tagline:
      "Marketplace potong 5-12% dari setiap order. Di SellOn, biayanya tetap per bulan - makin laris, makin untung kamu.",
    bullets: [
      "Uang masuk langsung ke rekening atau akun Midtrans-mu",
      "Pencairan ikut jadwal Midtrans (umumnya T+1), atau langsung kalau pakai transfer manual",
      "Tidak ada biaya tersembunyi belakangan",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
];

export function Features() {
  return (
    <Section id="fitur">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <Sparkles className="size-3.5" aria-hidden />
            Fitur
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Semua yang kamu perlukan untuk <br /> {" "}
            <span className="text-gradient-brand">jualan online</span>
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Dibuat untuk toko kecil yang ingin tumbuh - tanpa ribetnya
            marketplace, <br /> tanpa potongan setiap transaksi.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(
            ({ icon: Icon, title, tagline, bullets, iconBg, iconFg }, i) => (
              <div
                key={title}
                className={
                  "group flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated " +
                  // Make the first card span 2 columns on desktop for a
                  // bento-style anchor on the row.
                  (i === 0 ? "lg:col-span-2 lg:row-span-1" : "")
                }
              >
                <div
                  className={`flex size-11 items-center justify-center rounded-xl ${iconBg} ${iconFg} transition-colors group-hover:bg-brand-100`}
                >
                  <Icon className="size-5" strokeWidth={2} aria-hidden />
                </div>

                <div>
                  <h3 className="font-display text-lg font-semibold text-neutral-900">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                    {tagline}
                  </p>
                </div>

                <ul className="mt-auto flex flex-col gap-1.5 border-t border-neutral-100 pt-4 text-xs text-neutral-700">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2">
                      <Check
                        className="size-3.5 shrink-0 text-brand-600"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      </Container>
    </Section>
  );
}
