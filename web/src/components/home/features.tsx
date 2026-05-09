import {
  Store,
  CreditCard,
  ClipboardList,
  Users,
  Megaphone,
  BarChart3,
  Upload,
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
  // Tailwind tint for the icon container — kept inside the brand family but
  // varied so the grid doesn't feel monotonous.
  iconBg: string;
  iconFg: string;
};

const features: Feature[] = [
  {
    icon: Store,
    title: "Toko publik & katalog WhatsApp",
    tagline:
      "Halaman toko cantik dengan banner, tagline, dan link siap dibagikan ke pelanggan.",
    bullets: [
      "Search & filter kategori",
      "Produk unggulan & jam buka live",
      "Tombol share WA per produk",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: CreditCard,
    title: "Pembayaran fleksibel",
    tagline:
      "Pakai akun Midtrans-mu sendiri, atau cukup transfer manual + QRIS statis untuk yang baru mulai.",
    bullets: [
      "QRIS, VA, GoPay, ShopeePay",
      "Mode sandbox sebelum live",
      "Webhook per-toko (signature SHA-512)",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: ClipboardList,
    title: "Manajemen pesanan end-to-end",
    tagline:
      "Dari order masuk sampai paket diterima — semua diatur dari satu dasbor.",
    bullets: [
      "Status flow: pending → selesai",
      "Input resi & cetak nota",
      "Export CSV & catatan internal",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Upload,
    title: "Produk, varian & bulk upload",
    tagline:
      "Upload 200 produk via Excel sekali jalan. Dukung varian dengan stok & SKU sendiri-sendiri.",
    bullets: [
      "Foto langsung upload dari HP",
      "Varian (ukuran, warna) per produk",
      "Low-stock alert otomatis",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Users,
    title: "CRM pelanggan otomatis",
    tagline:
      "Database pembeli terkumpul tiap order. Datamu, dataku — bisa diekspor kapan saja.",
    bullets: [
      "Segmen otomatis (VIP / Loyal / Baru)",
      "Catatan & blacklist per pelanggan",
      "Quick chat WhatsApp",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Megaphone,
    title: "Promo & kupon diskon",
    tagline:
      "Bikin kode promo sendiri — persentase, nominal, atau gratis ongkir — lengkap dengan kuota dan masa berlaku.",
    bullets: [
      "Min belanja & batas pemakaian",
      "Validitas tanggal mulai/kadaluarsa",
      "Validasi otomatis di checkout",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: BarChart3,
    title: "Laporan & insight",
    tagline:
      "Lihat tren revenue harian, produk terlaris, dan pelanggan top — filter 7/30/90 hari.",
    bullets: [
      "Grafik revenue per hari",
      "Top 10 produk & pelanggan",
      "Breakdown status & metode bayar",
    ],
    iconBg: "bg-brand-50",
    iconFg: "text-brand-600",
  },
  {
    icon: Sparkles,
    title: "Tanpa potongan transaksi",
    tagline:
      "Biaya bulanan tetap. Tidak ada take-rate per pesanan. Semakin laris, semakin untung.",
    bullets: [
      "Dana langsung ke rekeningmu",
      "Settle hari yang sama (Midtrans)",
      "Tidak ada biaya tersembunyi",
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
            Semua yang UMKM butuhkan untuk{" "}
            <span className="text-gradient-brand">jualan online</span>
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Dirancang untuk toko kecil yang tumbuh — tanpa kerumitan
            marketplace, tanpa potongan transaksi.
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
