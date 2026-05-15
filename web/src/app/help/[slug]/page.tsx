import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Info,
  AlertTriangle,
  ChevronRight,
  Mail,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import {
  articleBySlug,
  articlesByCategory,
  helpArticles,
  helpCategories,
  type HelpBlock,
} from "@/lib/help-articles";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

type Params = { slug: string };

export async function generateStaticParams() {
  return helpArticles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = articleBySlug(slug);
  if (!a) return { title: "Artikel tidak ditemukan" };
  return pageMetadata({
    title: `${a.title} — Pusat Bantuan`,
    description: a.excerpt,
    path: `/help/${a.slug}`,
    ogType: "article",
  });
}

function renderBlock(b: HelpBlock, blockKey: string) {
  switch (b.type) {
    case "h2":
      return (
        <h2
          key={blockKey}
          className="mt-8 font-display text-xl font-semibold tracking-tight text-neutral-900"
        >
          {b.text}
        </h2>
      );
    case "p":
      return (
        <p
          key={blockKey}
          className="mt-4 text-base leading-relaxed text-neutral-700"
        >
          {b.text}
        </p>
      );
    case "ol":
      return (
        <ol
          key={blockKey}
          className="mt-4 flex flex-col gap-2 pl-6 text-base leading-relaxed text-neutral-700 [counter-reset:step]"
        >
          {b.items.map((it) => (
            <li
              key={it}
              className="relative pl-3 [counter-increment:step] before:absolute before:-left-3 before:top-0 before:font-display before:font-semibold before:text-brand-600 before:content-[counter(step)_'.']"
            >
              {it}
            </li>
          ))}
        </ol>
      );
    case "ul":
      return (
        <ul
          key={blockKey}
          className="mt-4 flex list-disc flex-col gap-2 pl-6 text-base leading-relaxed text-neutral-700 marker:text-brand-500"
        >
          {b.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      );
    case "callout": {
      const Icon = b.tone === "warning" ? AlertTriangle : Info;
      const toneClass =
        b.tone === "warning"
          ? "border-warning/40 bg-warning/10 text-neutral-800"
          : "border-brand-200 bg-brand-50/50 text-neutral-800";
      return (
        <div
          key={blockKey}
          className={
            "mt-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed " +
            toneClass
          }
        >
          <Icon
            className={
              "mt-0.5 size-4 shrink-0 " +
              (b.tone === "warning" ? "text-warning" : "text-brand-600")
            }
            aria-hidden
          />
          <p>{b.text}</p>
        </div>
      );
    }
  }
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const [me, { slug }] = await Promise.all([getMe(), params]);
  const article = articleBySlug(slug);
  if (!article) notFound();

  const category = helpCategories.find((c) => c.slug === article.category);
  const related = articlesByCategory(article.category).filter(
    (a) => a.slug !== article.slug,
  );

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
              path: `/help/${article.slug}`,
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
              { name: "Pusat Bantuan", path: "/help" },
              ...(category
                ? [{ name: category.title, path: `/help#${category.slug}` }]
                : []),
              { name: article.title, path: `/help/${article.slug}` },
            ]),
          ),
        }}
      />
      <Header me={me} />
      <main>
        <Section tight>
          <Container>
            <div className="mx-auto max-w-3xl">
              {/* Breadcrumb */}
              <nav
                className="mb-6 flex items-center gap-1.5 text-sm text-neutral-500"
                aria-label="Breadcrumb"
              >
                <Link
                  href="/help"
                  className="hover:text-neutral-900"
                >
                  Pusat Bantuan
                </Link>
                <ChevronRight className="size-3.5" aria-hidden />
                <span className="text-neutral-700">{category?.title}</span>
              </nav>

              <Badge variant="brand">{category?.title}</Badge>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                {article.title}
              </h1>
              <p className="mt-3 text-lg text-neutral-600">{article.excerpt}</p>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
                <Clock className="size-3.5" aria-hidden />
                <span>Baca sekitar {article.readingTime}</span>
              </div>

              <article className="mt-8 border-t border-neutral-200 pt-2">
                {article.body.map((b, i) => renderBlock(b, `${b.type}-${i}`))}
              </article>

              <div className="mt-12 border-t border-neutral-200 pt-6">
                <Link
                  href="/help"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Kembali ke Pusat Bantuan
                </Link>
              </div>
            </div>
          </Container>
        </Section>

        {related.length > 0 && (
          <Section bg="alt" tight>
            <Container>
              <div className="mx-auto max-w-3xl">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                  Artikel terkait di {category?.title}
                </h2>
                <ul className="mt-6 flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-card">
                  {related.map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/help/${a.slug}`}
                        className="group flex items-center gap-4 px-5 py-4"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-neutral-900 group-hover:text-brand-700">
                            {a.title}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-600">
                            {a.excerpt}
                          </p>
                        </div>
                        <ChevronRight
                          className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Container>
          </Section>
        )}

        <Section tight>
          <Container>
            <div className="mx-auto max-w-3xl rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-card sm:p-8">
              <h3 className="font-display text-xl font-semibold text-neutral-900">
                Masih bingung?
              </h3>
              <p className="mt-2 text-sm text-neutral-600">
                Tim support kami siap bantu lewat email atau WhatsApp.
              </p>
              <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <a
                  href="mailto:halo@sellon.id"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  <Mail className="size-4" aria-hidden />
                  halo@sellon.id
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
