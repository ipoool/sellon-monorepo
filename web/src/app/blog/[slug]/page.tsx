import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock, Lightbulb, AlertTriangle, ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { blogPosts, findPost, relatedPosts } from "@/lib/blog-posts";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return { title: "Artikel tidak ditemukan" };
  return pageMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    ogType: "article",
    publishedTime: post.publishedAt,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  const me = await getMe();
  const related = relatedPosts(post, 3);

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleJsonLd({
              title: post.title,
              description: post.excerpt,
              path: `/blog/${post.slug}`,
              datePublished: post.publishedAt,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Blog", path: "/blog" },
              { name: post.title, path: `/blog/${post.slug}` },
            ]),
          ),
        }}
      />

      <Header me={me} />
      <main>
        <article className="py-12 lg:py-16">
          <Container>
            <div className="mx-auto max-w-3xl">
              {/* Back link */}
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Semua artikel
              </Link>

              {/* Article header */}
              <header className="mt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="brand">{post.category}</Badge>
                  {post.plan && <PlanBadge plan={post.plan} />}
                </div>
                <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
                  {post.title}
                </h1>
                <p className="mt-4 text-lg leading-relaxed text-neutral-600">
                  {post.excerpt}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" aria-hidden />
                    {formatDate(post.publishedAt)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" aria-hidden />
                    Bacaan ~{post.readingTime}
                  </span>
                </div>
              </header>

              {/* Cover: real image for tutorials, gradient otherwise */}
              {post.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.coverImage}
                  alt={post.title}
                  loading="lazy"
                  decoding="async"
                  className="mt-8 w-full rounded-2xl border border-neutral-200 shadow-card"
                />
              ) : (
                <div
                  className={`mt-8 flex h-48 items-center justify-center rounded-2xl bg-gradient-to-br sm:h-64 ${post.coverColor}`}
                  aria-hidden
                >
                  <span className="font-display text-8xl font-bold text-white/15 select-none">
                    {post.title.charAt(0)}
                  </span>
                </div>
              )}

              {/* Article body */}
              <div className="mt-10 flex flex-col gap-8">
                {post.sections.map((s, i) => (
                  <section
                    key={s.heading ?? `section-${i}`}
                    className="flex flex-col gap-4"
                  >
                    {s.heading && (
                      <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                        {s.heading}
                      </h2>
                    )}
                    {s.paragraphs?.map((p) => (
                      <p
                        key={p}
                        className="text-base leading-relaxed text-neutral-700"
                      >
                        {p}
                      </p>
                    ))}
                    {s.bullets && (
                      <ul className="flex flex-col gap-2 pl-4">
                        {s.bullets.map((b) => (
                          <li
                            key={b}
                            className="relative pl-3 text-base leading-relaxed text-neutral-700 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-brand-500"
                          >
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.callout && (
                      <Callout
                        kind={s.callout.kind}
                        title={s.callout.title}
                        body={s.callout.body}
                      />
                    )}
                    {s.image && (
                      <figure className="flex flex-col gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.image.src}
                          alt={s.image.alt}
                          loading="lazy"
                          decoding="async"
                          className="w-full rounded-xl border border-neutral-200 shadow-card"
                        />
                        {s.image.caption && (
                          <figcaption className="text-center text-sm text-neutral-500">
                            {s.image.caption}
                          </figcaption>
                        )}
                      </figure>
                    )}
                  </section>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-16 rounded-xl border border-brand-200 bg-gradient-brand-soft p-6 sm:p-8">
                <h3 className="font-display text-xl font-semibold tracking-tight text-neutral-900">
                  Siap eksekusi?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  Buka toko di SellOn gratis — upload produk dalam menit, share
                  link katalog ke pelanggan WhatsApp, terima pembayaran QRIS
                  otomatis.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
                  >
                    Mulai gratis
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                  <Link
                    href="/blog"
                    className="inline-flex h-10 items-center rounded-lg border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    Baca artikel lain
                  </Link>
                </div>
              </div>

              {/* Related posts */}
              {related.length > 0 && (
                <section className="mt-16">
                  <h3 className="font-display text-xl font-semibold tracking-tight text-neutral-900">
                    Artikel terkait
                  </h3>
                  <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {related.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/blog/${p.slug}`}
                          className="group flex h-full flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                        >
                          <Badge variant="outline" className="w-fit">
                            {p.category}
                          </Badge>
                          <p className="font-semibold leading-snug text-neutral-900 group-hover:text-brand-700 line-clamp-2">
                            {p.title}
                          </p>
                          <p className="mt-auto text-xs text-neutral-500">
                            {p.readingTime}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </Container>
        </article>
      </main>
      <Footer />
    </>
  );
}

function PlanBadge({ plan }: { plan: "free" | "pro" | "bisnis" }) {
  const label =
    plan === "free" ? "Gratis" : plan === "pro" ? "Pro" : "Bisnis";
  const cls =
    plan === "free"
      ? "bg-neutral-100 text-neutral-700"
      : "bg-brand-100 text-brand-700";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
      title={`Fitur ini tersedia di paket ${label}`}
    >
      {plan === "free" ? "Semua paket" : `Paket ${label}`}
    </span>
  );
}

function Callout({
  kind,
  title,
  body,
}: {
  kind: "tip" | "warn";
  title: string;
  body: string;
}) {
  const isTip = kind === "tip";
  const Icon = isTip ? Lightbulb : AlertTriangle;
  return (
    <div
      className={
        "rounded-xl border p-4 sm:p-5 " +
        (isTip
          ? "border-brand-200 bg-brand-50/40"
          : "border-warning/40 bg-warning/10")
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full " +
            (isTip
              ? "bg-brand-100 text-brand-700"
              : "bg-warning/20 text-neutral-800")
          }
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-neutral-900">{title}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-neutral-700">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
