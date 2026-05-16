"use client";

import { useRef, useState } from "react";
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
  Palette,
  UserCog,
  ChevronLeft,
  ChevronRight,
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
};

const features: Feature[] = [
  {
    icon: Store,
    title: "Toko & katalog publik",
    tagline:
      "Link toko siap dibagikan dalam menit. Tinggal kirim ke grup WA atau bio Instagram, pembeli langsung lihat seluruh katalog.",
    bullets: [
      "6 pilihan tampilan: Grid, List, Showcase, Compact, Magazine, Feed",
      "Produk paling laku tampil paling atas",
      "Tombol order WhatsApp cukup sekali ketuk",
    ],
  },
  {
    icon: CreditCard,
    title: "Terima pembayaran apa pun",
    tagline:
      "QRIS, transfer bank, GoPay, ShopeePay — uang langsung masuk ke rekening kamu, bukan ke kami.",
    bullets: [
      "Pembayaran QRIS, transfer, GoPay, ShopeePay",
      "Coba dulu di mode sandbox sebelum live",
      "Notifikasi otomatis saat pembeli selesai bayar",
    ],
  },
  {
    icon: ClipboardList,
    title: "Manajemen pesanan",
    tagline:
      "Dari order masuk sampai paket diterima pembeli — semua status pesanan tercatat rapi.",
    bullets: [
      "Status jelas: baru, diproses, dikirim, atau selesai",
      "Masukkan nomor resi langsung dari HP",
      "Unduh semua pesanan jadi file Excel kapan saja",
    ],
  },
  {
    icon: Upload,
    title: "Produk & bulk upload",
    tagline:
      "Tambah satu produk atau ratusan sekaligus via Excel — selesai dalam 5 menit, bukan seharian.",
    bullets: [
      "Foto produk langsung dari HP",
      "Satu produk bisa banyak ukuran atau warna",
      "Notifikasi otomatis kalau stok mau habis",
    ],
  },
  {
    icon: Truck,
    title: "Integrasi kurir & ongkir",
    tagline:
      "Kaos, makanan, kerajinan — apa pun yang dikirim ke alamat pembeli, ongkirnya tinggal pilih.",
    bullets: [
      "Pilih kurir (JNE, J&T, SiCepat, dll.) langsung di checkout",
      "Ongkir hitung otomatis berdasarkan kota tujuan",
      "Input nomor resi tanpa pindah aplikasi",
    ],
  },
  {
    icon: Download,
    title: "Produk digital",
    tagline:
      "Ebook, kursus, atau template — link download otomatis dikirim ke email pembeli setelah bayar.",
    bullets: [
      "Pembeli digital tidak perlu isi alamat pengiriman",
      "Link akses otomatis dikirim ke email pembeli",
      "Link punya token unik, tidak bisa dibagi-bagi",
    ],
  },
  {
    icon: Users,
    title: "Database pelanggan",
    tagline:
      "Setiap pembeli langsung masuk daftar tanpa input manual. Tahu mana langganan setia, mana yang baru.",
    bullets: [
      "Segmentasi otomatis: Baru, Reguler, Loyal, VIP",
      "Tulis catatan kecil di tiap pelanggan",
      "Chat ulang pelanggan langsung dari dasbor",
    ],
  },
  {
    icon: Megaphone,
    title: "Promo & kode diskon",
    tagline:
      "Kode diskon, gratis ongkir, atau potongan harga — pakai cara apa pun untuk bikin pelanggan balik lagi.",
    bullets: [
      "Atur minimum belanja & batas pemakaian kode",
      "Tentukan tanggal mulai dan kapan promo habis",
      "Pembeli tinggal masukkan kode pas checkout",
    ],
  },
  {
    icon: BarChart3,
    title: "Laporan penjualan",
    tagline:
      "Penjualan harian, produk paling laku, pelanggan paling loyal — semua di satu halaman laporan.",
    bullets: [
      "Grafik pendapatan harian yang mudah dibaca",
      "Tahu produk mana yang paling laku",
      "Bandingkan performa 7, 30, atau 90 hari terakhir",
    ],
  },
  {
    icon: Palette,
    title: "Tampilan & custom domain",
    tagline:
      "Pilih warna brand, layout produk, dan pasang domain sendiri — toko terlihat profesional.",
    bullets: [
      "Warna brand sesuaikan dari satu pengaturan",
      "Pasang domain sendiri (mis. toko.namabrand.com)",
      "Logo dan banner upload langsung dari dasbor",
    ],
  },
  {
    icon: UserCog,
    title: "Multi-staf dengan role",
    tagline:
      "Tidak harus kerja sendirian. Undang staf lewat email, atur siapa yang bisa apa.",
    bullets: [
      "Role Admin: akses penuh kelola toko",
      "Role Staff: hanya bisa update status pesanan",
      "Tiap aksi anggota tim tercatat di audit log",
    ],
  },
  {
    icon: Sparkles,
    title: "Biaya tetap, bukan per transaksi",
    tagline:
      "Marketplace potong 5–12% dari setiap order. Di SellOn, biaya flat per bulan — makin laris, makin untung.",
    bullets: [
      "Uang masuk langsung ke rekening atau akun Midtrans-mu",
      "Pencairan T+1 via Midtrans, atau instan kalau transfer manual",
      "Tidak ada biaya tersembunyi",
    ],
  },
];

export function Features() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 8);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 8);
  }

  function scroll(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  }

  return (
    <Section id="fitur">
      <Container>
        {/* Header row: title left, arrows right */}
        <div className="flex items-end justify-between gap-6">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <Sparkles className="size-3.5" aria-hidden />
              Fitur
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Semua yang kamu perlukan untuk{" "}
              <span className="text-gradient-brand">jualan online</span>
            </h2>
            <p className="mt-3 text-base text-neutral-600">
              Dibuat untuk toko kecil yang ingin tumbuh — tanpa ribetnya
              marketplace, tanpa potongan setiap transaksi.
            </p>
          </div>

          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scroll(-1)}
              disabled={atStart}
              aria-label="Sebelumnya"
              className="flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-card transition-all hover:border-brand-300 hover:text-brand-600 disabled:opacity-30 disabled:shadow-none"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              disabled={atEnd}
              aria-label="Berikutnya"
              className="flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-card transition-all hover:border-brand-300 hover:text-brand-600 disabled:opacity-30 disabled:shadow-none"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Scrollable track — 1 card on mobile, 2 on sm, 3 on lg */}
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="mt-8 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        >
          {features.map(({ icon: Icon, title, tagline, bullets }) => (
            <div
              key={title}
              className="group flex w-full flex-none flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-card transition-all duration-200 [scroll-snap-align:start] hover:border-brand-300 hover:shadow-elevated lg:w-1/3"
            >
              {/* Icon — small+left on mobile, large+top on sm+ */}
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <Icon className="size-5" strokeWidth={2} aria-hidden />
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-neutral-900">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                    {tagline}
                  </p>
                </div>

                <ul className="flex flex-col gap-1.5 border-t border-neutral-100 pt-3 text-xs text-neutral-700">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-brand-600"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-xs text-neutral-400 lg:hidden">
          Geser untuk lihat semua fitur →
        </p>
      </Container>
    </Section>
  );
}
