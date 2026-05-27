import Link from "next/link";
import { ArrowRight, BookOpen, Calendar, Clock } from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { blogPosts } from "@/lib/blog-posts";

// Ambil artikel featured + 3 lainnya untuk variasi kategori.
const featured = blogPosts.find((p) => p.featured) ?? blogPosts[0];
const others = blogPosts
  .filter((p) => p.slug !== featured.slug)
  .slice(0, 3);
const previewPosts = [featured, ...others];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BlogPreview() {
  return (
    <Section bg="alt">
      <Container>
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <BookOpen className="size-3.5" aria-hidden />
              Dari Blog SellOn
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Tips jualan yang langsung bisa dipraktikkan
            </h2>
            <p className="mt-3 text-base text-neutral-600">
              Artikel praktis dari lapangan — khusus untuk seller WhatsApp dan
              UMKM Indonesia.
            </p>
          </div>
          <Link
            href="/blog"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Lihat semua artikel
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {/* Cards */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {previewPosts.map((post, i) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
            >
              {/* Decorative cover */}
              <div
                className={`flex h-28 items-center justify-center bg-gradient-to-br ${post.coverColor}`}
                aria-hidden
              >
                {i === 0 && (
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                    Artikel Pilihan
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2.5 p-4">
                <Badge variant="outline" className="w-fit text-[11px]">
                  {post.category}
                </Badge>

                <h3 className="font-display text-sm font-semibold leading-snug tracking-tight text-neutral-900 group-hover:text-brand-700 line-clamp-3">
                  {post.title}
                </h3>

                <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-1 text-[11px] text-neutral-400">
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
  );
}
