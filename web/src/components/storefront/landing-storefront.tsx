"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Megaphone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LandingConfig, LandingSection } from "@/lib/landing-config";
import { ProductCard, type StorefrontProduct } from "./storefront-catalog";

type Category = { id: string; name: string };

type Props = {
  storeSlug: string;
  config: LandingConfig;
  products: StorefrontProduct[];
  categories: Category[];
  // Set by the layout preview dialog's phone frame; see storefront-catalog.
  forceMobile?: boolean;
};

/**
 * Section-based home page: announcement bar → hero slider → product rows →
 * promo banners → text blocks, in whatever order the seller arranged.
 *
 * The page-level chrome (store header, closed-store notice, footer) stays in
 * app/[slug]/page.tsx; this renders only the composable middle. Product cards
 * are the same ProductCard the grid layout uses, so the two templates can't
 * diverge on how a product looks.
 */
export function LandingStorefront({
  storeSlug,
  config,
  products,
  categories,
  forceMobile = false,
}: Props) {
  const surface = surfaceClasses(config.background);

  // "Lihat semua" on a limited row needs somewhere to go. On this template
  // there is no separate catalog page, so it targets the first unlimited
  // "all products" section on the same page — and is omitted when there is
  // none, rather than linking to an anchor that does not exist.
  const allSectionId = config.sections.find(
    (s) => s.type === "products" && s.source === "all" && s.limit === 0,
  )?.id;

  return (
    <div className={cn("-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8", surface.page)}>
      <div className="flex flex-col gap-10 py-6 lg:gap-14 lg:py-10">
        {config.sections.map((s) => (
          <Section
            key={s.id}
            section={s}
            products={products}
            categories={categories}
            surface={surface}
            forceMobile={forceMobile}
            storeSlug={storeSlug}
            allSectionId={allSectionId}
          />
        ))}
      </div>
    </div>
  );
}

// Background treatments layered over the store's own theme hue. `page` is
// the page surface, `heading`/`muted` keep text legible on it — the dark
// variant is the only one that flips the text palette.
function surfaceClasses(bg: LandingConfig["background"]) {
  switch (bg) {
    case "soft":
      return { page: "bg-neutral-50", heading: "text-neutral-900", muted: "text-neutral-600" };
    case "tinted":
      return { page: "bg-brand-50", heading: "text-neutral-900", muted: "text-neutral-700" };
    case "dark":
      return { page: "bg-neutral-900", heading: "text-white", muted: "text-neutral-300" };
    default:
      return { page: "bg-white", heading: "text-neutral-900", muted: "text-neutral-600" };
  }
}
type Surface = ReturnType<typeof surfaceClasses>;

/**
 * Promo strip at the very top of the page, above the store header — the
 * "Diskon ongkir 50%…" line a shop like apelicious.com opens with. Rendered
 * by app/[slug]/page.tsx so it sits above the header, not inside the body.
 */
export function AnnouncementBar({
  text,
  linkUrl,
}: {
  text: string;
  linkUrl?: string;
}) {
  const inner = (
    <span className="inline-flex items-center justify-center gap-2 text-center text-xs font-semibold tracking-wide sm:text-sm">
      <Megaphone className="size-3.5 shrink-0" aria-hidden />
      {text}
      {linkUrl && <ArrowRight className="size-3.5 shrink-0" aria-hidden />}
    </span>
  );
  const cls = "block bg-brand-600 px-4 py-2 text-white";
  if (linkUrl) {
    return (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:opacity-95")}>
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function Section({
  section,
  storeSlug,
  products,
  categories,
  surface,
  forceMobile,
  allSectionId,
}: {
  section: LandingSection;
  storeSlug: string;
  products: StorefrontProduct[];
  categories: Category[];
  surface: Surface;
  forceMobile: boolean;
  allSectionId?: string;
}) {
  switch (section.type) {
    case "slider":
      return <HeroSlider slides={section.slides} autoplayMs={section.autoplay_ms ?? 5000} />;
    case "products":
      return (
        <ProductRow
          section={section}
          storeSlug={storeSlug}
          products={products}
          categories={categories}
          surface={surface}
          forceMobile={forceMobile}
          allSectionId={allSectionId}
        />
      );
    case "banner":
      return <PromoBanner imageUrl={section.image_url} linkUrl={section.link_url} />;
    case "text":
      return <TextBlock section={section} surface={surface} />;
  }
}

// ── Slider ──────────────────────────────────────────────────────────────

function HeroSlider({
  slides,
  autoplayMs,
}: {
  slides: { image_url: string; link_url?: string }[];
  autoplayMs: number;
}) {
  const usable = useMemo(() => slides.filter((s) => s.image_url), [slides]);
  const count = usable.length;
  const [index, setIndex] = useState(0);
  const safeIndex = count > 0 ? index % count : 0;

  useEffect(() => {
    if (count <= 1 || autoplayMs <= 0) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), autoplayMs);
    return () => clearTimeout(t);
  }, [index, count, autoplayMs]);

  // An empty slider is the state every store starts in — render nothing
  // rather than an empty grey strip.
  if (count === 0) return null;

  return (
    <div className="relative w-full min-w-0 overflow-hidden rounded-2xl bg-neutral-100 shadow-card">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${safeIndex * 100}%)` }}
      >
        {usable.map((s, i) => {
          // Plain <img>: slide images are seller uploads of arbitrary size
          // served through the API proxy; next/image is unoptimized here anyway.
          /* eslint-disable-next-line @next/next/no-img-element */
          const img = <img src={s.image_url} alt={`Slide ${i + 1}`} className="aspect-[16/7] w-full shrink-0 object-cover sm:aspect-[16/6]" />;
          return s.link_url ? (
            <a key={i} href={s.link_url} target="_blank" rel="noopener noreferrer" className="w-full shrink-0">
              {img}
            </a>
          ) : (
            <div key={i} className="w-full shrink-0">{img}</div>
          );
        })}
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Slide sebelumnya"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-neutral-900 shadow-soft hover:bg-white sm:inline-flex"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Slide berikutnya"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-neutral-900 shadow-soft hover:bg-white sm:inline-flex"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
            {usable.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safeIndex ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Products ────────────────────────────────────────────────────────────

function ProductRow({
  section,
  storeSlug,
  products,
  categories,
  surface,
  forceMobile,
  allSectionId,
}: {
  section: Extract<LandingSection, { type: "products" }>;
  storeSlug: string;
  products: StorefrontProduct[];
  categories: Category[];
  surface: Surface;
  forceMobile: boolean;
  allSectionId?: string;
}) {
  const items = useMemo(() => {
    let list = products;
    switch (section.source) {
      case "featured":
        list = products.filter((p) => p.is_featured);
        break;
      case "newest":
        // The public list arrives newest-first already; "newest" is a
        // bounded head of it rather than a re-sort.
        list = products;
        break;
      case "category":
        list = section.category_id
          ? products.filter((p) => p.category_id === section.category_id)
          : [];
        break;
      default:
        list = products;
    }
    return section.limit > 0 ? list.slice(0, section.limit) : list;
  }, [products, section.source, section.category_id, section.limit]);

  // A row with nothing in it (no featured products yet, empty category)
  // disappears instead of showing a heading over blank space.
  if (items.length === 0) return null;

  const title =
    section.title ||
    (section.source === "category"
      ? categories.find((c) => c.id === section.category_id)?.name ?? "Produk"
      : "Produk");

  const cols = forceMobile
    ? "grid-cols-2"
    : section.columns === 6
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      : section.columns === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <section aria-labelledby={`sec-${section.id}`}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2
          id={`sec-${section.id}`}
          className={cn("font-display text-xl font-semibold tracking-tight sm:text-2xl", surface.heading)}
        >
          {title}
        </h2>
        {section.limit > 0 && allSectionId && allSectionId !== section.id && (
          <a
            href={`#sec-${allSectionId}`}
            className={cn("inline-flex items-center gap-1 text-sm font-medium hover:underline", surface.muted)}
          >
            Lihat semua <ArrowRight className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      <div className={cn("grid gap-3 sm:gap-4", cols)}>
        {items.map((p) => (
          <ProductCard key={p.id} p={p} storeSlug={storeSlug} />
        ))}
      </div>
    </section>
  );
}

// ── Banner ──────────────────────────────────────────────────────────────

function PromoBanner({ imageUrl, linkUrl }: { imageUrl: string; linkUrl?: string }) {
  if (!imageUrl) return null;
  /* eslint-disable-next-line @next/next/no-img-element */
  const img = <img src={imageUrl} alt="Promo" className="w-full rounded-2xl object-cover shadow-card" />;
  return linkUrl ? (
    <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
      {img}
    </a>
  ) : (
    <div>{img}</div>
  );
}

// ── Text ────────────────────────────────────────────────────────────────

function TextBlock({
  section,
  surface,
}: {
  section: Extract<LandingSection, { type: "text" }>;
  surface: Surface;
}) {
  if (!section.title && !section.body) return null;
  return (
    <section className={cn("mx-auto max-w-2xl", section.align === "center" && "text-center")}>
      {section.title && (
        <h2 className={cn("font-display text-2xl font-semibold tracking-tight", surface.heading)}>
          {section.title}
        </h2>
      )}
      {section.body && (
        <p className={cn("mt-3 whitespace-pre-line text-sm leading-relaxed sm:text-base", surface.muted)}>
          {section.body}
        </p>
      )}
    </section>
  );
}
