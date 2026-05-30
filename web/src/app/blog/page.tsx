import Link from "next/link";
import { Calendar, Clock, ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { blogPosts } from "@/lib/blog-posts";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Blog SellOn — Tips Jualan Online untuk UMKM Indonesia",
  description:
    "Artikel praktis seputar jualan WhatsApp, pembayaran QRIS, strategi UMKM, dan tips toko online untuk seller Indonesia.",
  path: "/blog",
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
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
        {/* Hero */}
        <section className="relative overflow-hidden py-16 lg:py-24">
          <div
            aria-hidden
            className="bg-dot-grid pointer-events-none absolute inset-x-0 bottom-0 top-0 -z-10 opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent_80%)]"
          />
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="brand">Blog SellOn</Badge>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
                Tips jualan untuk UMKM Indonesia
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-neutral-600">
                Artikel praktis dari lapangan — strategi jualan WhatsApp,
                pembayaran digital, foto produk, dan lebih banyak lagi.
              </p>
            </div>
          </Container>
        </section>

        {/* Featured post */}
        <Section bg="alt" tight>
          <Container>
            <Link
              href={`/blog/${featured.slug}`}
              className="group grid overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated lg:grid-cols-5"
            >
              {/* Cover: image for tutorials, gradient otherwise */}
              {featured.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featured.coverImage}
                  alt={featured.title}
                  className="h-48 w-full object-cover lg:col-span-2 lg:h-full"
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
                <div className="flex items-center gap-2">
                  <Badge variant="brand">{featured.category}</Badge>
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    Artikel Pilihan
                  </span>
                </div>

                <h2 className="font-display text-2xl font-semibold leading-snug tracking-tight text-neutral-900 group-hover:text-brand-700 sm:text-3xl">
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
        </Section>

        {/* Article grid */}
        <Section>
          <Container>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              Artikel lainnya
            </h2>

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  {/* Cover: image for tutorials, gradient otherwise */}
                  {post.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="h-32 w-full object-cover"
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
                    <Badge variant="outline" className="w-fit">
                      {post.category}
                    </Badge>

                    <h3 className="font-display text-lg font-semibold leading-snug tracking-tight text-neutral-900 group-hover:text-brand-700 line-clamp-2">
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
        </Section>

        {/* CTA */}
        <Section bg="brand-soft" tight>
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                Sudah baca, sekarang saatnya eksekusi
              </h2>
              <p className="mt-4 text-base leading-relaxed text-neutral-600">
                Buka toko online di SellOn gratis — share link katalog ke
                pelanggan WhatsApp dan terima order tanpa balas chat satu per
                satu.
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
                >
                  Mulai gratis sekarang
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/guides"
                  className="inline-flex h-11 items-center gap-1 rounded-lg px-4 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
                >
                  Lihat panduan UMKM →
                </Link>
              </div>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
