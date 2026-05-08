import type { Metadata } from "next";
import {
  GraduationCap,
  Camera,
  TrendingUp,
  MessagesSquare,
  Truck,
  HeartHandshake,
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

export const metadata: Metadata = {
  title: "Panduan UMKM — SellOn",
  description:
    "Panduan praktis untuk UMKM Indonesia: dari foto produk, penetapan harga, sampai pemasaran via WhatsApp.",
};

type Article = {
  category: string;
  title: string;
  excerpt: string;
  readingTime: string;
};

const featured: Article[] = [
  {
    category: "Pemula",
    title: "Cara mulai jualan online tanpa modal besar",
    excerpt:
      "Bukan tentang seberapa banyak modal, tapi seberapa cepat kamu bisa eksekusi. Panduan dari pemilik warung yang sukses dalam 6 bulan.",
    readingTime: "8 menit",
  },
  {
    category: "Foto Produk",
    title: "5 trik foto produk pakai HP yang bikin laris",
    excerpt:
      "Tidak perlu kamera DSLR. Cuma butuh cahaya pagi, kain putih, dan komposisi yang tepat. Plus contoh before/after.",
    readingTime: "5 menit",
  },
  {
    category: "Pemasaran",
    title: "Strategi WhatsApp Broadcast yang tidak menyebalkan",
    excerpt:
      "Cara kirim broadcast ke pelanggan tanpa membuat mereka block. Frekuensi, timing, dan template yang berhasil.",
    readingTime: "6 menit",
  },
];

type Category = {
  icon: LucideIcon;
  title: string;
  description: string;
  count: number;
};

const categories: Category[] = [
  {
    icon: GraduationCap,
    title: "Pemula",
    description:
      "Step-by-step buat yang baru pertama kali jualan online.",
    count: 12,
  },
  {
    icon: Camera,
    title: "Foto Produk",
    description:
      "Trik foto pakai HP, lighting natural, editing minimal.",
    count: 8,
  },
  {
    icon: TrendingUp,
    title: "Penetapan Harga",
    description:
      "Cara hitung HPP, margin sehat, dan strategi diskon.",
    count: 7,
  },
  {
    icon: MessagesSquare,
    title: "Pemasaran WhatsApp",
    description:
      "Broadcast, status WhatsApp, balasan otomatis, etika.",
    count: 10,
  },
  {
    icon: Truck,
    title: "Pengiriman",
    description:
      "Pilih kurir, packing aman, COD, dan resi otomatis.",
    count: 6,
  },
  {
    icon: HeartHandshake,
    title: "Customer Service",
    description:
      "Handle komplain, retur, review buruk, dan pelanggan setia.",
    count: 9,
  },
];

const popularArticles = [
  "Cara hitung HPP produk makanan",
  "Template balasan WhatsApp untuk pesanan masuk",
  "Bedanya JNE, J&T, SiCepat — mana yang paling cocok untuk UMKM-mu?",
  "Cara handle pembeli yang minta refund tanpa rugi",
  "Branding murah untuk warung: logo, kemasan, konsistensi",
];

export default async function PanduanPage() {
  const me = await getMe();

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
                Panduan praktis dari sesama UMKM Indonesia — bukan teori, bukan
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
                <p className="text-sm font-medium text-brand-600">Pilihan Editor</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  Yang sering dibaca minggu ini
                </h2>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {featured.map((a) => (
                <article
                  key={a.title}
                  className="group flex cursor-not-allowed flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                  title="Akan segera hadir"
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
                </article>
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
                Dari setup awal sampai scaling — kami coba bahas semua sisi
                jualan online buat UMKM.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map(({ icon: Icon, title, description, count }) => (
                <div
                  key={title}
                  className="group flex cursor-not-allowed flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                  title="Akan segera hadir"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                    <Icon className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                      {description}
                    </p>
                  </div>
                  <p className="mt-auto text-xs font-medium text-neutral-500">
                    {count} artikel
                  </p>
                </div>
              ))}
            </div>
          </Container>
        </Section>

        {/* Popular articles list */}
        <Section bg="alt" tight>
          <Container>
            <div className="mx-auto max-w-3xl">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                Paling banyak dibaca
              </h2>

              <ol className="mt-8 flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-card">
                {popularArticles.map((title, i) => (
                  <li
                    key={title}
                    className="group flex cursor-not-allowed items-center gap-4 px-5 py-4"
                    title="Akan segera hadir"
                  >
                    <span className="font-display text-2xl font-semibold text-neutral-300 group-hover:text-brand-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="flex-1 font-medium text-neutral-900 group-hover:text-brand-700">
                      {title}
                    </p>
                    <ArrowRight
                      className="size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                      aria-hidden
                    />
                  </li>
                ))}
              </ol>

              <p className="mt-6 text-center text-sm text-neutral-500">
                Konten panduan akan dirilis bertahap. Subscribe newsletter via{" "}
                <a
                  href="mailto:halo@sellon.id"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  halo@sellon.id
                </a>{" "}
                untuk dapat update.
              </p>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
