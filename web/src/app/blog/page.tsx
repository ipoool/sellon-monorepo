import Link from "next/link";
import { Calendar, Clock, ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { getMe } from "@/lib/server-auth";
import { blogPosts } from "@/lib/blog-posts";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Blog — Tips Jualan Online untuk UMKM Indonesia",
  description:
    "Artikel praktis seputar jualan WhatsApp, pembayaran QRIS, strategi UMKM, dan tips toko online untuk seller Indonesia.",
  path: "/blog",
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPage() {
  const me = await getMe();
  const featured = blogPosts.find((p) => p.featured) ?? blogPosts[0];
  const rest = blogPosts.filter((p) => p.slug !== featured.slug);

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
                Blog SellOn
              </p>
              <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900 sm:text-5xl lg:text-[52px] lg:tracking-[-0.022em]">
                Tips jualan untuk UMKM Indonesia
              </h1>
              <p className="mx-auto mt-4 text-[15px] leading-relaxed text-neutral-600 sm:text-base">
                Artikel praktis dari lapangan — strategi jualan WhatsApp,
                pembayaran digital, foto produk, dan lebih banyak lagi.
              </p>
            </div>
          </Container>
        </section>

        {/* Featured post */}
        <section className="py-12 lg:py-16">
          <Container>
            <Link
              href={`/blog/${featured.slug}`}
              className="group grid overflow-hidden rounded-3xl border border-neutral-200 bg-white transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated lg:grid-cols-5"
            >
              {/* Cover: image for tutorials, gradient otherwise */}
              {featured.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featured.coverImage}
                  alt={featured.title}
                  loading="lazy"
                  decoding="async"
                  className="h-48 w-full bg-neutral-100 object-cover lg:col-span-2 lg:h-full"
                />
              ) : (
                <div
                  className={`flex h-48 items-center justify-center bg-gradient-to-br lg:col-span-2 lg:h-full ${featured.coverColor}`}
                  aria-hidden
                >
                  <span className="font-display text-6xl font-bold text-white/20 select-none">
                    {featured.title.charAt(0)}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-4 p-7 lg:col-span-3 lg:p-10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                    Artikel pilihan
                  </span>
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700">
                    {featured.category}
                  </span>
                </div>

                <h2 className="font-display text-2xl font-bold leading-snug tracking-[-0.015em] text-neutral-900 group-hover:text-brand-700 sm:text-3xl">
                  {featured.title}
                </h2>

                <p className="text-base leading-relaxed text-neutral-600">
                  {featured.excerpt}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-4 text-sm text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" aria-hidden />
                    {formatDate(featured.publishedAt)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" aria-hidden />
                    {featured.readingTime}
                  </span>
                  <span className="ml-auto flex items-center gap-1 font-medium text-brand-700 group-hover:gap-2 transition-all">
                    Baca artikel
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </div>
              </div>
            </Link>
          </Container>
        </section>

        {/* Article grid */}
        <section className="py-12 lg:py-16">
          <Container>
            <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
              Artikel lainnya
            </h2>

            <div className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated"
                >
                  {/* Cover: image for tutorials, gradient otherwise */}
                  {post.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      loading="lazy"
                      decoding="async"
                      className="h-32 w-full bg-neutral-100 object-cover"
                    />
                  ) : (
                    <div
                      className={`flex h-32 items-center justify-center bg-gradient-to-br ${post.coverColor}`}
                      aria-hidden
                    >
                      <span className="font-display text-4xl font-bold text-white/20 select-none">
                        {post.title.charAt(0)}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <span className="w-fit rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700">
                      {post.category}
                    </span>

                    <h3 className="font-display text-lg font-bold leading-snug tracking-[-0.01em] text-neutral-900 group-hover:text-brand-700 line-clamp-2">
                      {post.title}
                    </h3>

                    <p className="text-sm leading-relaxed text-neutral-600 line-clamp-2">
                      {post.excerpt}
                    </p>

                    <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" aria-hidden />
                        {formatDate(post.publishedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" aria-hidden />
                        {post.readingTime}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Container>
        </section>

        {/* CTA */}
        <section className="pb-16 pt-4 lg:pb-20">
          <Container>
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-brand-soft px-6 py-10 sm:px-10 sm:py-12">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-soft-dots opacity-70"
              />
              <div className="relative max-w-[52ch]">
                <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-neutral-900 sm:text-3xl">
                  Sudah baca, sekarang saatnya eksekusi
                </h2>
                <p className="mt-2.5 text-[15px] leading-relaxed text-neutral-600">
                  Buka toko online di SellOn gratis — share link katalog ke
                  pelanggan WhatsApp dan terima order tanpa balas chat satu per
                  satu.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700"
                  >
                    Mulai gratis sekarang
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link
                    href="/guides"
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white/70 px-5 py-3 text-sm font-bold text-brand-700 transition-colors hover:bg-white"
                  >
                    Lihat panduan UMKM
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
