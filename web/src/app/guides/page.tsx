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
        {/* Hero — same wash and type scale as the home and About heroes. */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-320px] h-[700px] w-[1500px] -translate-x-1/2"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.94 0.06 145 / 0.55) 0%, oklch(0.97 0.025 145 / 0.45) 45%, oklch(1 0 0 / 0) 72%)",
            }}
          />
          <Container>
            <div className="relative mx-auto max-w-[58ch] pb-10 pt-12 text-center lg:pt-14">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                Panduan UMKM
              </p>
              <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900 sm:text-5xl lg:text-[52px] lg:tracking-[-0.022em]">
                Belajar bareng SellOn
              </h1>
              <p className="mx-auto mt-4 text-[15px] leading-relaxed text-neutral-600 sm:text-base">
                Panduan praktis dari sesama UMKM Indonesia — bukan teori, bukan
                copy-paste dari luar negeri. Yang sudah terbukti di warung dan
                toko online beneran.
              </p>
            </div>
          </Container>
        </section>

        {/* Featured articles */}
        <section className="py-12 lg:py-16">
          <Container>
            <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
              Yang sering dibaca minggu ini
            </h2>
            <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-neutral-600">
              Pilihan editor, diurutkan dari yang paling sering dibuka.
            </p>

            <div className="mt-6 grid gap-3.5 lg:grid-cols-3">
              {featured.map((a) => (
                <Link
                  key={a.slug}
                  href={`/guides/${a.slug}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated"
                >
                  <span className="w-fit rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700">
                    {a.category}
                  </span>
                  <h3 className="font-display text-lg font-bold leading-snug tracking-[-0.01em] text-neutral-900 group-hover:text-brand-700">
                    {a.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    {a.excerpt}
                  </p>
                  <div className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-neutral-500">
                    <Clock className="size-3.5" aria-hidden />
                    <span>{a.readingTime}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Container>
        </section>

        {/* Category grid */}
        <section className="py-12 lg:py-16">
          <Container>
            <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
              Telusuri berdasarkan topik
            </h2>
            <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-neutral-600">
              Dari setup awal sampai scaling — kami coba bahas semua sisi
              jualan online buat UMKM.
            </p>

            <div className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map(({ icon: Icon, title, description, count }, i) => {
                const chip = ["bg-brand-500", "bg-info", "bg-warning", "bg-danger"][i % 4];
                const tint = ["bg-brand-50", "bg-info/10", "bg-warning/10", "bg-danger/10"][i % 4];
                const inner = (
                  <>
                    <span className={`grid size-11 place-items-center rounded-2xl ${chip}`}>
                      <Icon className="size-[22px] text-white" aria-hidden />
                    </span>
                    <div className="mt-4">
                      <h3 className="font-display text-lg font-bold leading-snug text-neutral-900">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                        {description}
                      </p>
                    </div>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                      {count} artikel{count === 0 ? " · segera hadir" : ""}
                    </p>
                  </>
                );
                return count > 0 ? (
                  <Link
                    key={title}
                    href={`/guides/topik/${categorySlug(title)}`}
                    className={`group flex flex-col rounded-3xl p-6 transition-transform hover:-translate-y-0.5 ${tint}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={title}
                    className="flex flex-col rounded-3xl bg-neutral-50 p-6 opacity-70"
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </Container>
        </section>

        {/* All other articles */}
        {popular.length > 0 && (
          <section className="pb-16 pt-4 lg:pb-20">
            <Container>
              <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
                Artikel lainnya
              </h2>

              <ol className="mt-6 flex flex-col divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {popular.map((a, i) => (
                  <li key={a.slug}>
                    <Link
                      href={`/guides/${a.slug}`}
                      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand-50/50"
                    >
                      <span className="font-display text-xl font-bold tabular-nums text-neutral-300 group-hover:text-brand-400">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-neutral-900 group-hover:text-brand-700">
                          {a.title}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {a.category} · {a.readingTime}
                        </p>
                      </div>
                      <ArrowRight
                        className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ol>

              <p className="mt-5 text-sm text-neutral-500">
                Lebih banyak artikel akan dirilis bertahap. Punya request topik?
                Kirim ke{" "}
                <a
                  href="mailto:halo@sellon.id"
                  className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  halo@sellon.id
                </a>
                .
              </p>
            </Container>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
