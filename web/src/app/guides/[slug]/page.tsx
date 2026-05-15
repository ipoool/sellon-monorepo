import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Lightbulb, AlertTriangle } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { articles, findArticle } from "@/lib/guides-articles";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) return { title: "Panduan tidak ditemukan" };
  return pageMetadata({
    title: `${article.title} — Panduan UMKM`,
    description: article.excerpt,
    path: `/guides/${article.slug}`,
    ogType: "article",
  });
}

export default async function PanduanArticlePage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) notFound();

  const me = await getMe();
  const others = articles.filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleJsonLd({
              title: article.title,
              description: article.excerpt,
              path: `/guides/${article.slug}`,
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
              { name: "Panduan UMKM", path: "/guides" },
              { name: article.title, path: `/guides/${article.slug}` },
            ]),
          ),
        }}
      />
      <Header me={me} />
      <main>
        <article className="py-12 lg:py-16">
          <Container>
            <div className="mx-auto max-w-3xl">
              <Link
                href="/guides"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Semua panduan
              </Link>

              <header className="mt-6">
                <Badge variant="brand">{article.category}</Badge>
                <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
                  {article.title}
                </h1>
                <p className="mt-4 text-lg leading-relaxed text-neutral-600">
                  {article.excerpt}
                </p>
                <div className="mt-5 flex items-center gap-1.5 text-sm text-neutral-500">
                  <Clock className="size-3.5" aria-hidden />
                  <span>Bacaan ~{article.readingTime}</span>
                </div>
              </header>

              <div className="mt-10 flex flex-col gap-8">
                {article.sections.map((s, i) => (
                  <section
                    key={s.heading || `section-${i}`}
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
                  </section>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-16 rounded-xl border border-brand-200 bg-gradient-brand-soft p-6 sm:p-8">
                <h3 className="font-display text-xl font-semibold tracking-tight text-neutral-900">
                  Siap eksekusi?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  Buka toko di SellOn gratis - upload produk dalam menit, share
                  link katalog ke pelanggan WhatsApp.
                </p>
                <div className="mt-4">
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    Mulai gratis
                  </Link>
                </div>
              </div>

              {/* Related */}
              {others.length > 0 && (
                <section className="mt-16">
                  <h3 className="font-display text-xl font-semibold tracking-tight text-neutral-900">
                    Bacaan lainnya
                  </h3>
                  <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {others.map((a) => (
                      <li key={a.slug}>
                        <Link
                          href={`/guides/${a.slug}`}
                          className="group flex h-full flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                        >
                          <Badge variant="outline" className="w-fit">
                            {a.category}
                          </Badge>
                          <p className="font-semibold leading-snug text-neutral-900 group-hover:text-brand-700">
                            {a.title}
                          </p>
                          <p className="mt-auto text-xs text-neutral-500">
                            {a.readingTime}
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
            (isTip ? "bg-brand-100 text-brand-700" : "bg-warning/20 text-neutral-800")
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
