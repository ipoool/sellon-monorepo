import Link from "next/link";
import {
  GraduationCap,
  Camera,
  TrendingUp,
  MessagesSquare,
  Truck,
  HeartHandshake,
  Store,
  Utensils,
  Award,
  Clock,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { articles, categorySlug } from "@/lib/guides-articles";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Panduan UMKM",
  description:
    "Panduan praktis untuk UMKM Indonesia: dari foto produk & penetapan harga HPP, sampai kelola toko online + offline, operasional kafe (QR meja & dapur), dan loyalitas pelanggan.",
  path: "/guides",
});

type Category = {
  icon: LucideIcon;
  title: string;
  description: string;
};

// Map article category strings → display config. Articles' counts are
// derived live from the data array so adding a new article auto-updates
// the index.
const categoryConfig: Record<string, Category> = {
  Operasional: {
    icon: Store,
    title: "Operasional",
    description: "Sinkron stok online & offline, kasir POS, dan bahan baku.",
  },
  "F&B / Kuliner": {
    icon: Utensils,
    title: "F&B / Kuliner",
    description: "QR meja, layar dapur (KDS), resep, dan antrian pesanan.",
  },
  "Loyalitas Pelanggan": {
    icon: Award,
    title: "Loyalitas Pelanggan",
    description: "Membership, poin, dan strategi bikin pelanggan balik lagi.",
  },
  Pemula: {
    icon: GraduationCap,
    title: "Pemula",
    description: "Step-by-step buat yang baru pertama kali jualan online.",
  },
  "Foto Produk": {
    icon: Camera,
    title: "Foto Produk",
    description: "Trik foto pakai HP, lighting natural, editing minimal.",
  },
  "Penetapan Harga": {
    icon: TrendingUp,
    title: "Penetapan Harga",
    description: "Cara hitung HPP, margin sehat, dan strategi diskon.",
  },
  Pemasaran: {
    icon: MessagesSquare,
    title: "Pemasaran",
    description: "Broadcast, status WhatsApp, etika promosi.",
  },
  Pengiriman: {
    icon: Truck,
    title: "Pengiriman",
    description: "Pilih kurir, packing aman, COD, dan resi otomatis.",
  },
  "Customer Service": {
    icon: HeartHandshake,
    title: "Customer Service",
    description:
      "Handle komplain, retur, review buruk, dan pelanggan setia.",
  },
};

export default async function PanduanPage() {
  const me = await getMe();

  const featured = articles.slice(0, 3);
  const popular = articles.slice(3);

  // Build category counts from live articles
  const counts: Record<string, number> = {};
  for (const a of articles) counts[a.category] = (counts[a.category] ?? 0) + 1;
  const categories = Object.entries(categoryConfig).map(([key, cfg]) => ({
    ...cfg,
    count: counts[key] ?? 0,
  }));

  return (
    <>
      <Header me={me} />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-16 lg:py-24">
          <div
            aria-hidden
            className="bg-dot-grid pointer-events-none absolute inset-x-0 bottom-0 top-0 -z-10 opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent_80%)]"
          />
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="brand">Panduan UMKM</Badge>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
                Belajar bareng SellOn
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-neutral-600">
                Panduan praktis dari sesama UMKM Indonesia - bukan teori, bukan
                copy-paste dari luar negeri. Yang sudah terbukti di warung dan
                toko online beneran.
              </p>
            </div>
          </Container>
        </section>

        {/* Featured articles */}
        <Section bg="alt" tight>
          <Container>
            <div className="mb-10 flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-brand-600">
                  Pilihan Editor
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  Yang sering dibaca minggu ini
                </h2>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {featured.map((a) => (
                <Link
                  key={a.slug}
                  href={`/guides/${a.slug}`}
                  className="group flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <Badge variant="brand">{a.category}</Badge>
                  <h3 className="font-display text-xl font-semibold leading-snug tracking-tight text-neutral-900 group-hover:text-brand-700">
                    {a.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    {a.excerpt}
                  </p>
                  <div className="mt-auto flex items-center gap-1.5 text-xs text-neutral-500">
                    <Clock className="size-3.5" aria-hidden />
                    <span>{a.readingTime}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Container>
        </Section>

        {/* Category grid */}
        <Section>
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-brand-600">Topik</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Telusuri berdasarkan topik
              </h2>
              <p className="mt-4 text-lg text-neutral-600">
                Dari setup awal sampai scaling - kami coba bahas semua sisi
                jualan online buat UMKM.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map(({ icon: Icon, title, description, count }) => {
                const inner = (
                  <>
                    <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="size-5" strokeWidth={2} aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 group-hover:text-brand-700">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                        {description}
                      </p>
                    </div>
                    <p className="mt-auto text-xs font-medium text-neutral-500">
                      {count} artikel{count === 0 ? " (segera hadir)" : ""}
                    </p>
                  </>
                );
                return count > 0 ? (
                  <Link
                    key={title}
                    href={`/guides/topik/${categorySlug(title)}`}
                    className="group flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={title}
                    className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 opacity-70 shadow-card"
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </Container>
        </Section>

        {/* All other articles */}
        {popular.length > 0 && (
          <Section bg="alt" tight>
            <Container>
              <div className="mx-auto max-w-3xl">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                  Artikel lainnya
                </h2>

                <ol className="mt-8 flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-card">
                  {popular.map((a, i) => (
                    <li key={a.slug}>
                      <Link
                        href={`/guides/${a.slug}`}
                        className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
                      >
                        <span className="font-display text-2xl font-semibold text-neutral-300 group-hover:text-brand-300">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-neutral-900 group-hover:text-brand-700">
                            {a.title}
                          </p>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {a.category} · {a.readingTime}
                          </p>
                        </div>
                        <ArrowRight
                          className="size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ol>

                <p className="mt-6 text-center text-sm text-neutral-500">
                  Lebih banyak artikel akan dirilis bertahap. Punya request
                  topik? Kirim ke{" "}
                  <a
                    href="mailto:halo@sellon.id"
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    halo@sellon.id
                  </a>
                  .
                </p>
              </div>
            </Container>
          </Section>
        )}
      </main>
      <Footer />
    </>
  );
}
