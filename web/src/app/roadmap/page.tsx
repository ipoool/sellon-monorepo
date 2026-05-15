import {
  CheckCircle2,
  Hammer,
  Rocket,
  Lightbulb,
  ThumbsUp,
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
    "Apa yang sedang dibangun di SellOn. Public roadmap dengan ETA, voting, dan request fitur dari komunitas UMKM.",
  path: "/roadmap",
});

type Status = "shipped" | "in-progress" | "next" | "considering";

type RoadmapItem = {
  title: string;
  description: string;
  votes: number;
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
        description: "Daftar dan login dengan akun Google. Akun otomatis dibuat.",
        votes: 142,
      },
      {
        title: "Halaman dasbor v1",
        description:
          "Greeting time-based, quick actions, 4 metric stat dengan sparkline.",
        votes: 98,
      },
      {
        title: "Theme system editable",
        description:
          "Founder bisa rebrand seluruh app via 1 file globals.css (OKLCH).",
        votes: 45,
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
        title: "Manajemen produk",
        description:
          "Upload foto, atur stok, varian, kategori. Drag-and-drop untuk reorder.",
        votes: 287,
        eta: "Q3 2026",
      },
      {
        title: "Integrasi Midtrans QRIS",
        description:
          "Connect akun Midtrans seller, generate QR code per pesanan, webhook payment confirmed.",
        votes: 261,
        eta: "Q3 2026",
      },
      {
        title: "Halaman katalog publik",
        description:
          "Link katalog yang bisa dibagikan ke WhatsApp, dilihat tanpa login.",
        votes: 198,
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
        title: "Manajemen pesanan",
        description:
          "Status pesanan (baru/diproses/dikirim/selesai), kirim resi, riwayat.",
        votes: 245,
        eta: "Q4 2026",
      },
      {
        title: "Otomasi WhatsApp",
        description:
          "Konfirmasi pesanan, reminder pembayaran, status pengiriman - auto-send via WA.",
        votes: 312,
        eta: "Q4 2026",
      },
      {
        title: "Integrasi kurir (Biteship)",
        description:
          "Hitung ongkir dari berbagai kurir, generate resi, lacak pengiriman.",
        votes: 178,
        eta: "Q4 2026",
      },
      {
        title: "Multi-staff admin",
        description:
          "Tambah staf dengan role berbeda (admin, kasir, gudang). Audit log.",
        votes: 134,
        eta: "Q4 2026",
      },
    ],
  },
  {
    status: "considering",
    icon: Lightbulb,
    title: "Sedang Dipertimbangkan",
    description: "Belum komit. Vote dan feedback bantu kami prioritaskan.",
    items: [
      {
        title: "Aplikasi mobile (iOS + Android)",
        description:
          "Native app untuk kelola toko dari HP. Mungkin React Native, mungkin native.",
        votes: 421,
      },
      {
        title: "Marketplace plugin (Tokopedia/Shopee)",
        description:
          "Sync produk dan stok ke marketplace tanpa input ulang.",
        votes: 289,
      },
      {
        title: "POS & barcode scanner",
        description:
          "Untuk toko yang juga punya cabang fisik. Kasir + scanner + cash drawer.",
        votes: 167,
      },
      {
        title: "Bahasa Inggris + multi-currency",
        description:
          "Untuk seller yang ekspor ke Singapura, Malaysia, atau brand turis.",
        votes: 89,
      },
      {
        title: "API publik & webhook",
        description:
          "Untuk seller yang punya developer in-house atau pakai automation tools.",
        votes: 76,
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
                Roadmap ini diperbarui setiap minggu. Vote ide yang penting buat
                kamu - yang paling banyak vote naik prioritas.
              </p>
              <p className="mt-3 text-sm text-neutral-500">
                Terakhir diperbarui · 8 Mei 2026
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
                        className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                      >
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-900">
                            {item.title}
                          </h3>
                          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                            {item.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
                            disabled
                            title="Voting akan segera hadir"
                            aria-label={`Vote ${item.title}`}
                          >
                            <ThumbsUp className="size-3" aria-hidden />
                            <span>{item.votes}</span>
                          </button>
                          {item.eta && (
                            <Badge variant="outline">{item.eta}</Badge>
                          )}
                          {col.status === "shipped" && (
                            <Badge variant="success">Live</Badge>
                          )}
                        </div>
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
                <a href="mailto:roadmap@sellon.id?subject=Request fitur SellOn">
                  <Button size="lg">Kirim ide via email</Button>
                </a>
                <a href="https://wa.me/6281234567890">
                  <Button size="lg" variant="outline">
                    Chat WhatsApp
                  </Button>
                </a>
              </div>

              <p className="mt-6 text-xs text-neutral-600">
                Voting fitur akan segera hadir di halaman ini. Untuk sekarang,
                request via email atau WhatsApp.
              </p>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
