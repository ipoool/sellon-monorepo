import {
  CheckCircle2,
  Hammer,
  Rocket,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/server-auth";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Roadmap",
  description:
    "Apa yang sedang dibangun di SellOn. Public roadmap dengan fitur yang sudah rilis, sedang dikerjakan, dan yang akan datang.",
  path: "/roadmap",
});

type Status = "shipped" | "in-progress" | "next" | "considering";

type RoadmapItem = {
  title: string;
  description: string;
  eta?: string;
};

type Column = {
  status: Status;
  icon: LucideIcon;
  title: string;
  description: string;
  items: RoadmapItem[];
};

const columns: Column[] = [
  {
    status: "shipped",
    icon: CheckCircle2,
    title: "Sudah Rilis",
    description: "Sudah live dan dipakai merchant.",
    items: [
      {
        title: "Login Google SSO",
        description:
          "Daftar dan masuk dengan akun Google. Tidak perlu isi formulir — toko langsung bisa dibuat.",
      },
      {
        title: "Storefront publik + 6 layout",
        description:
          "Halaman katalog yang bisa dibagikan via WhatsApp. Pilih tampilan: Grid, List, Showcase, Compact, Magazine, atau Feed.",
      },
      {
        title: "Manajemen produk lengkap",
        description:
          "Upload foto, atur stok & varian, kategori, bulk upload via XLSX, duplikat produk, produk digital dengan auto-delivery.",
      },
      {
        title: "Pembayaran Midtrans + manual",
        description:
          "Koneksi akun Midtrans sendiri (QRIS dinamis, GoPay, ShopeePay, VA). Juga tersedia transfer manual + QRIS statis.",
      },
      {
        title: "Manajemen pesanan",
        description:
          "Tracking status pesanan dari pending sampai selesai, input nomor resi, export CSV, notifikasi WhatsApp otomatis ke pembeli.",
      },
      {
        title: "Integrasi kurir (ongkos kirim)",
        description:
          "Hitung ongkir dari berbagai kurir (JNE, J&T, SiCepat, dll.) langsung di checkout pembeli.",
      },
      {
        title: "Manajemen pelanggan + segmentasi",
        description:
          "Database pelanggan dengan segmentasi otomatis (VIP, Loyal, Reguler, Baru) berdasarkan frekuensi dan total belanja.",
      },
      {
        title: "Promo & kode diskon",
        description:
          "Buat kode promo persentase, nominal tetap, atau free ongkir. Atur limit pemakaian, minimum pembelian, dan masa berlaku.",
      },
      {
        title: "Laporan penjualan",
        description:
          "Overview revenue, top produk, top pelanggan. Grafik tren per periode. Tersedia untuk paket Pro ke atas.",
      },
      {
        title: "Multi-staf dengan role",
        description:
          "Undang staf via email. Role Admin (akses penuh) dan Staff (hanya update pesanan). Audit log setiap aksi.",
      },
      {
        title: "Custom domain",
        description:
          "Pakai domain sendiri (mis. toko.namabrand.com) sebagai alamat storefront. SSL otomatis.",
      },
      {
        title: "Paket berlangganan Pro & Bisnis",
        description:
          "Upgrade via transfer atau Midtrans. Fitur terkunci (laporan, multi-staf, bulk upload) terbuka sesuai paket.",
      },
    ],
  },
  {
    status: "in-progress",
    icon: Hammer,
    title: "Sedang Dikerjakan",
    description: "Ada di pipeline saat ini.",
    items: [
      {
        title: "Auto-renewal langganan",
        description:
          "Perpanjang langganan otomatis via Midtrans tanpa perlu transfer manual setiap periode.",
        eta: "Q3 2026",
      },
      {
        title: "Push notification pesanan baru",
        description:
          "Notifikasi real-time ke browser / HP seller saat ada pesanan masuk — tidak perlu cek dasbor terus.",
        eta: "Q3 2026",
      },
      {
        title: "Review & ulasan produk",
        description:
          "Pembeli bisa beri rating dan ulasan setelah pesanan selesai. Seller bisa reply dan moderasi.",
        eta: "Q3 2026",
      },
    ],
  },
  {
    status: "next",
    icon: Rocket,
    title: "Berikutnya",
    description: "Setelah yang sedang dikerjakan beres.",
    items: [
      {
        title: "API publik & webhook",
        description:
          "Untuk seller yang punya developer in-house atau mau connect ke automation tools (Zapier, Make, dll.).",
        eta: "Q4 2026",
      },
      {
        title: "Program afiliasi & referral",
        description:
          "Beri komisi ke influencer atau pelanggan yang mereferensikan pembeli baru ke toko kamu.",
        eta: "Q4 2026",
      },
      {
        title: "Analitik konversi",
        description:
          "Funnel checkout, abandonment rate, sumber traffic. Bantu identifikasi di mana pembeli drop off.",
        eta: "Q4 2026",
      },
      {
        title: "Ekspor laporan ke PDF",
        description:
          "Download laporan penjualan bulanan dalam format PDF siap cetak untuk keperluan pembukuan.",
        eta: "Q4 2026",
      },
    ],
  },
  {
    status: "considering",
    icon: Lightbulb,
    title: "Sedang Dipertimbangkan",
    description: "Belum komit. Feedback dari komunitas bantu kami prioritaskan.",
    items: [
      {
        title: "Aplikasi mobile (iOS + Android)",
        description:
          "Native app untuk kelola toko dari HP. Notifikasi push, scan barcode, update pesanan on-the-go.",
      },
      {
        title: "Sync ke marketplace",
        description:
          "Sinkronisasi produk dan stok ke Tokopedia, Shopee, atau TikTok Shop tanpa input ulang.",
      },
      {
        title: "Live chat dengan pembeli",
        description:
          "Fitur chat toko built-in supaya pembeli bisa tanya langsung sebelum beli.",
      },
      {
        title: "POS & kasir toko fisik",
        description:
          "Untuk seller yang juga punya toko offline. Scanner barcode, kasir, sinkronisasi stok.",
      },
      {
        title: "Multi-bahasa & multi-currency",
        description:
          "Untuk seller yang ekspor ke Singapura, Malaysia, atau melayani pembeli asing.",
      },
    ],
  },
];

const statusStyles: Record<Status, string> = {
  shipped: "bg-success/10 text-success",
  "in-progress": "bg-warning/15 text-neutral-800",
  next: "bg-info/10 text-info",
  considering: "bg-neutral-100 text-neutral-700",
};

export default async function RoadmapPage() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-16 lg:py-20">
          <div
            aria-hidden
            className="bg-dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[300px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent_75%)]"
          />
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="brand">Roadmap Publik</Badge>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
                Yang sedang kami bangun
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-neutral-600">
                Roadmap ini diperbarui secara berkala. Punya ide atau request
                fitur? Hubungi kami langsung.
              </p>
              <p className="mt-3 text-sm text-neutral-500">
                Terakhir diperbarui · 16 Mei 2026
              </p>
            </div>
          </Container>
        </section>

        {/* Roadmap columns */}
        <Section tight>
          <Container>
            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
              {columns.map((col) => (
                <div key={col.status} className="flex flex-col gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex size-7 items-center justify-center rounded-md ${statusStyles[col.status]}`}
                      >
                        <col.icon className="size-4" aria-hidden />
                      </span>
                      <h2 className="font-display text-lg font-semibold tracking-tight text-neutral-900">
                        {col.title}
                      </h2>
                      <span className="ml-auto text-xs text-neutral-500">
                        {col.items.length}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-neutral-600">
                      {col.description}
                    </p>
                  </div>

                  <ul className="flex flex-col gap-3">
                    {col.items.map((item) => (
                      <li
                        key={item.title}
                        className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
                      >
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-900">
                            {item.title}
                          </h3>
                          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                            {item.description}
                          </p>
                        </div>
                        {(item.eta || col.status === "shipped") && (
                          <div className="flex items-center gap-2">
                            {item.eta && (
                              <Badge variant="outline">{item.eta}</Badge>
                            )}
                            {col.status === "shipped" && (
                              <Badge variant="success">Live</Badge>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Container>
        </Section>

        {/* Request feature CTA */}
        <Section bg="brand-soft" tight>
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Punya ide fitur?
              </h2>
              <p className="mt-4 text-lg text-neutral-700">
                Kami baca semua request. Kalau cocok dengan misi UMKM-first
                kami, biasanya masuk &ldquo;Sedang Dipertimbangkan&rdquo; dalam
                seminggu.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href="mailto:halo@sellon.id?subject=Request fitur SellOn">
                  <Button size="lg">Kirim ide via email</Button>
                </a>
                <a href="https://wa.me/6281291006534">
                  <Button size="lg" variant="outline">
                    Chat WhatsApp
                  </Button>
                </a>
              </div>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
