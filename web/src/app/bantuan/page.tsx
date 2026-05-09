import type { Metadata } from "next";
import Link from "next/link";
import {
  Search,
  Rocket,
  Package,
  ShoppingCart,
  CreditCard,
  Settings,
  Crown,
  ArrowRight,
  Mail,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import {
  helpCategories,
  articlesByCategory,
  type HelpCategorySlug,
} from "@/lib/help-articles";

export const metadata: Metadata = {
  title: "Pusat Bantuan — SellOn",
  description:
    "Jawaban atas pertanyaan umum, panduan langkah demi langkah, dan cara menghubungi tim support SellOn.",
};

const iconBySlug: Record<HelpCategorySlug, LucideIcon> = {
  memulai: Rocket,
  "produk-katalog": Package,
  pesanan: ShoppingCart,
  pembayaran: CreditCard,
  "akun-pengaturan": Settings,
  berlangganan: Crown,
};

export default async function BantuanPage() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main>
        {/* Hero with search */}
        <section className="relative overflow-hidden bg-gradient-brand-soft py-16 lg:py-24">
          <div
            aria-hidden
            className="bg-dot-grid absolute inset-0 opacity-50"
          />
          <Container>
            <div className="relative mx-auto max-w-2xl text-center">
              <Badge variant="brand">Pusat Bantuan</Badge>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
                Apa yang bisa kami bantu?
              </h1>
              <p className="mt-4 text-lg text-neutral-600">
                Cari jawaban dari panduan, FAQ, atau hubungi tim kami langsung.
              </p>

              <div className="mt-8">
                <label htmlFor="bantuan-search" className="sr-only">
                  Cari bantuan
                </label>
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-neutral-400"
                  >
                    <Search className="size-5" />
                  </span>
                  <input
                    id="bantuan-search"
                    type="search"
                    placeholder="Misal: cara setup QRIS, refund, ubah harga…"
                    className="w-full rounded-xl border border-neutral-200 bg-white py-4 pl-12 pr-4 text-base shadow-card transition-all placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Pencarian akan segera hadir. Untuk sekarang, jelajahi
                  kategori di bawah.
                </p>
              </div>
            </div>
          </Container>
        </section>

        {/* Categories grid */}
        <Section>
          <Container>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {helpCategories.map(({ slug, title }) => {
                const Icon = iconBySlug[slug];
                const articles = articlesByCategory(slug);
                return (
                  <div
                    key={slug}
                    className="group flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                        <Icon className="size-5" strokeWidth={2} aria-hidden />
                      </div>
                      <span className="text-xs font-medium text-neutral-500">
                        {articles.length} artikel
                      </span>
                    </div>

                    <div>
                      <h2 className="font-semibold text-neutral-900">
                        {title}
                      </h2>
                      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                        {articles.map((a) => (
                          <li key={a.slug}>
                            <Link
                              href={`/bantuan/${a.slug}`}
                              className="text-neutral-600 transition-colors hover:text-brand-700"
                            >
                              · {a.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {articles[0] && (
                      <Link
                        href={`/bantuan/${articles[0].slug}`}
                        className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Mulai baca
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </Container>
        </Section>

        {/* Contact CTA */}
        <Section bg="alt" tight>
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Tidak nemu jawaban-mu?
              </h2>
              <p className="mt-4 text-lg text-neutral-600">
                Tim support kami available Senin–Jumat jam 9 pagi sampai 6 sore
                WIB. Sabtu untuk urgent only.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <a
                  href="mailto:halo@sellon.id"
                  className="group flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <div className="flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Mail className="size-5" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-neutral-900">Email Kami</p>
                    <p className="text-sm text-neutral-600">halo@sellon.id</p>
                  </div>
                  <ArrowRight
                    className="size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                    aria-hidden
                  />
                </a>

                <a
                  href="https://wa.me/6281234567890"
                  className="group flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <div className="flex size-11 items-center justify-center rounded-lg bg-success/10 text-success">
                    <MessageCircle className="size-5" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-neutral-900">
                      Chat WhatsApp
                    </p>
                    <p className="text-sm text-neutral-600">
                      0812-3456-7890
                    </p>
                  </div>
                  <ArrowRight
                    className="size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                    aria-hidden
                  />
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
