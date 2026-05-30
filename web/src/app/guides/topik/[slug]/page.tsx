import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import {
  articles,
  articlesByCategorySlug,
  categorySlug,
} from "@/lib/guides-articles";
import { pageMetadata } from "@/lib/seo";

// Pre-render a page per category that actually has articles.
export function generateStaticParams() {
  const slugs = new Set(articles.map((a) => categorySlug(a.category)));
  return [...slugs].map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = articlesByCategorySlug(slug);
  if (!cat) {
    return pageMetadata({
      title: "Topik tidak ditemukan",
      description: "Topik panduan tidak ditemukan.",
      path: `/guides/topik/${slug}`,
    });
  }
  return pageMetadata({
    title: `Panduan ${cat.category}`,
    description: `Kumpulan panduan UMKM kategori ${cat.category} dari SellOn — praktis dan langsung bisa dipraktikkan.`,
    path: `/guides/topik/${slug}`,
  });
}

export default async function GuidesTopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await getMe();
  const cat = articlesByCategorySlug(slug);
  if (!cat) notFound();

  return (
    <>
      <Header me={me} />
      <main>
        <Section>
          <Container>
            <Link
              href="/guides"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Semua panduan
            </Link>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              {cat.category}
            </h1>
            <p className="mt-2 text-neutral-600">
              {cat.items.length} panduan di topik ini.
            </p>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {cat.items.map((a) => (
                <Link
                  key={a.slug}
                  href={`/guides/${a.slug}`}
                  className="group flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated"
                >
                  <Badge variant="brand" className="w-fit">
                    {a.category}
                  </Badge>
                  <h3 className="font-display text-lg font-semibold leading-snug tracking-tight text-neutral-900 group-hover:text-brand-700">
                    {a.title}
                  </h3>
                  <p className="line-clamp-3 text-sm leading-relaxed text-neutral-600">
                    {a.excerpt}
                  </p>
                  <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-neutral-500">
                    <Clock className="size-3.5" aria-hidden />
                    {a.readingTime}
                    <ArrowRight className="ml-auto size-4 text-brand-600 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </div>
                </Link>
              ))}
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
