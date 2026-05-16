"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Package, Star, Sparkles, RotateCcw, ShoppingBag, ShoppingCart, Plus, Minus } from "lucide-react";

import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useOptionalCart } from "@/components/storefront/cart-context";
import { KioskSplash } from "@/components/storefront/kiosk-splash";
import type { LayoutConfig } from "@/lib/types";

type StorefrontProduct = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock: number;
  photo_urls: string[];
  is_featured: boolean;
  product_type?: "physical" | "digital";
};

// Stock numbers are hidden for digital products (no real inventory) and
// for sellers using a sentinel "unlimited" value (>= 9999) to signal
// always-available items. Physical products still show "Stok: N" or
// "Stok habis" so buyers can plan.
const UNLIMITED_STOCK_THRESHOLD = 9999;
function shouldHideStock(p: { product_type?: string; stock: number }): boolean {
  return p.product_type === "digital" || p.stock >= UNLIMITED_STOCK_THRESHOLD;
}

type StorefrontCategory = {
  id: string;
  name: string;
};

export type ProductLayout =
  | "grid"
  | "list"
  | "showcase"
  | "compact"
  | "magazine"
  | "feed"
  | "kiosk"
  | "katalog"
  | "poster";

type Props = {
  storeSlug: string;
  products: StorefrontProduct[];
  categories: StorefrontCategory[];
  // Layout produk:
  //   grid     → multi-kolom card sama besar (default).
  //   list     → satu kolom, thumbnail kecil + info di samping.
  //   showcase → produk pertama hero full-width, sisanya grid 2 kolom.
  layout?: ProductLayout;
  // forceMobile: di-set true oleh preview dialog saat user pilih frame
  // mobile. Tailwind responsive class (`sm:`, `lg:`, ...) trigger di
  // viewport asli, jadi di dalam frame max-w-sm kita perlu override
  // manual ke kolom-kolom yang masuk akal untuk layar HP.
  forceMobile?: boolean;
  layoutConfig?: LayoutConfig;
};

export function StorefrontCatalog({
  storeSlug,
  products,
  categories,
  layout = "grid",
  forceMobile = false,
  layoutConfig,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");

  const kioskConfig = layoutConfig?.kiosk;
  const showSplash =
    layout === "kiosk" &&
    !!kioskConfig?.banner_enabled &&
    (kioskConfig?.banner_slides?.filter((s) => s.image_url).length ?? 0) > 0;

  // Initialize to showSplash so server HTML, client hydration, and first paint
  // all start with products hidden — eliminating the flash of products before splash.
  // useEffect then immediately clears it if the user already dismissed this session.
  const [splashActive, setSplashActive] = useState(showSplash);

  useEffect(() => {
    if (!showSplash) return;
    const dismissed =
      sessionStorage.getItem(`${storeSlug}:kiosk-splash-dismissed`) === "1";
    if (dismissed) setSplashActive(false);
  // showSplash and storeSlug are stable across renders; run once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Categories with at least 1 product
  const usedCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.category_id)
        counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return categories.reduce<Array<typeof categories[number] & { count: number }>>(
      (acc, c) => {
        const count = counts.get(c.id) ?? 0;
        if (count > 0) acc.push({ ...c, count });
        return acc;
      },
      [],
    );
  }, [categories, products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategoryId && p.category_id !== activeCategoryId) return false;
      if (!q) return true;
      return (p.name + " " + p.description).toLowerCase().includes(q);
    });
  }, [query, products, activeCategoryId]);

  const featured = useMemo(
    () => products.filter((p) => p.is_featured),
    [products],
  );
  const showFeaturedSection =
    !query && !activeCategoryId && featured.length > 0;
  const gridProducts = showFeaturedSection
    ? filtered.filter((p) => !p.is_featured)
    : filtered;

  return (
    <>
      {showSplash && splashActive && (
        <KioskSplash
          storeSlug={storeSlug}
          slides={kioskConfig!.banner_slides.filter((s) => s.image_url)}
          slideDurationMs={kioskConfig!.slide_duration_ms}
          ctaLabel={kioskConfig!.cta_label}
          onDismiss={() => setSplashActive(false)}
        />
      )}
      {!splashActive && (
      <><div
        id="produk"
        className={cn(
          "mb-6 flex flex-col gap-3",
          !forceMobile && "sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <div className="flex items-baseline gap-2">
          <h2
            className={cn(
              "font-display font-semibold text-neutral-900",
              forceMobile ? "text-base" : "text-xl",
            )}
          >
            Produk
          </h2>
          <span
            className={cn(
              "whitespace-nowrap text-neutral-500",
              forceMobile ? "text-xs" : "text-sm",
            )}
          >
            {filtered.length}
            {(query || activeCategoryId) && filtered.length !== products.length
              ? ` dari ${products.length}`
              : ""}{" "}
            item
          </span>
        </div>
        <div className={cn("relative w-full", !forceMobile && "sm:w-72")}>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400"
          >
            <Search className="size-4" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk…"
            className={cn(
              "w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
              forceMobile ? "h-9 text-xs" : "h-10 text-sm",
            )}
          />
        </div>
      </div>

      {usedCategories.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategoryId("")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              activeCategoryId === ""
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-brand-400",
            )}
          >
            Semua
            <span className="ml-1.5 text-[10px] opacity-70">
              {products.length}
            </span>
          </button>
          {usedCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategoryId(c.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategoryId === c.id
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-brand-400",
              )}
            >
              {c.name}
              <span className="ml-1.5 text-[10px] opacity-70">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-brand-50/40 px-6 py-16 text-center shadow-card sm:px-10 sm:py-20">
          {/* Decorative background — soft brand-tinted dot grid + a couple
              of floating sparkles so the empty state doesn't feel like
              an error. */}
          <div
            aria-hidden
            className="bg-dot-grid pointer-events-none absolute inset-0 opacity-40"
          />
          <Sparkles
            aria-hidden
            className="pointer-events-none absolute left-8 top-10 size-5 text-brand-300 sm:left-16 sm:top-14"
          />
          <Sparkles
            aria-hidden
            className="pointer-events-none absolute right-10 top-20 size-4 text-brand-200 sm:right-20 sm:top-24"
          />
          <Sparkles
            aria-hidden
            className="pointer-events-none absolute bottom-12 left-12 size-3 text-brand-200 sm:left-24"
          />

          <div className="relative mx-auto flex max-w-md flex-col items-center">
            {/* Hero icon — big, brand-tinted, with a soft halo so it
                grabs the eye instead of feeling like a placeholder. */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-brand-200/40 blur-2xl"
              />
              <div className="flex size-20 items-center justify-center rounded-2xl border border-brand-200/60 bg-white text-brand-600 shadow-elevated">
                {query || activeCategoryId ? (
                  <Search className="size-9" strokeWidth={1.75} aria-hidden />
                ) : (
                  <ShoppingBag
                    className="size-9"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
              </div>
            </div>

            <h3 className="mt-6 font-display text-xl font-semibold text-neutral-900 sm:text-2xl">
              {query || activeCategoryId
                ? "Hmm, belum ada yang cocok"
                : "Toko ini lagi siap-siap"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-600">
              {query || activeCategoryId ? (
                <>
                  Kata kunci{" "}
                  {query && (
                    <span className="font-medium text-neutral-900">
                      &ldquo;{query}&rdquo;
                    </span>
                  )}{" "}
                  belum ketemu produknya. Coba kata kunci lain atau lihat
                  kategori yang tersedia.
                </>
              ) : (
                <>
                  Penjual sedang menyiapkan produk-produk keren untukmu.
                  Pantau terus halaman ini, ya — bookmark dulu biar nggak
                  ketinggalan saat katalognya rilis.
                </>
              )}
            </p>

            {(query || activeCategoryId) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveCategoryId("");
                }}
                className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-soft transition-colors hover:border-brand-400 hover:text-brand-700"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset pencarian
              </button>
            )}

            {!query && !activeCategoryId && (
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-xs font-medium text-brand-700 shadow-soft">
                <Package className="size-3.5" aria-hidden />
                Katalog akan segera tersedia
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {showFeaturedSection && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <Star
                  className="size-4 fill-warning text-warning"
                  aria-hidden
                />
                <h3 className="font-display text-lg font-semibold text-neutral-900">
                  Produk Unggulan
                </h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {featured.map((p) => (
                  <ProductCard key={p.id} p={p} storeSlug={storeSlug} featured />
                ))}
              </div>
            </section>
          )}

          {gridProducts.length > 0 && (
            <ProductLayoutBody
              layout={layout}
              products={gridProducts}
              storeSlug={storeSlug}
              forceMobile={forceMobile}
            />
          )}
        </>
      )}
      </>)}
    </>
  );
}

function ProductCard({
  p,
  storeSlug,
  featured = false,
}: {
  p: StorefrontProduct;
  storeSlug: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated",
        featured ? "border-warning/30" : "border-neutral-200",
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            width={400}
            height={400}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-400">
            <Package className="size-10" aria-hidden />
          </div>
        )}
        {p.is_featured && !featured && (
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-warning/90 px-2 py-0.5 text-[10px] font-semibold text-white"
            aria-label="Unggulan"
          >
            <Star className="size-3 fill-current" aria-hidden />
            Unggulan
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <p className="line-clamp-2 text-sm font-medium text-neutral-900">
          {p.name}
        </p>
        <p className="font-display text-base font-semibold text-neutral-900">
          {formatRupiah(p.price_cents)}
        </p>
        {!shouldHideStock(p) && (
          <p className="mt-1 text-xs text-neutral-500">
            {p.stock > 0 ? `Stok: ${p.stock}` : "Stok habis"}
          </p>
        )}
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Layout dispatcher + variants
// ─────────────────────────────────────────────────────────────────────

function ProductLayoutBody({
  layout,
  products,
  storeSlug,
  forceMobile = false,
}: {
  layout: ProductLayout;
  products: StorefrontProduct[];
  storeSlug: string;
  forceMobile?: boolean;
}) {
  if (layout === "list") {
    return (
      <div className="flex flex-col gap-3">
        {products.map((p) => (
          <ProductListItem key={p.id} p={p} storeSlug={storeSlug} />
        ))}
      </div>
    );
  }
  if (layout === "showcase") {
    const [hero, ...rest] = products;
    return (
      <div className="flex flex-col gap-6">
        {hero && (
          <ProductHeroCard
            p={hero}
            storeSlug={storeSlug}
            forceMobile={forceMobile}
          />
        )}
        {rest.length > 0 && (
          <div
            className={cn(
              "grid gap-4",
              forceMobile
                ? "grid-cols-2"
                : "sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {rest.map((p) => (
              <ProductCard key={p.id} p={p} storeSlug={storeSlug} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (layout === "compact") {
    return (
      <div
        className={cn(
          "grid gap-2",
          forceMobile
            ? "grid-cols-3"
            : "grid-cols-3 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5 xl:grid-cols-6",
        )}
      >
        {products.map((p) => (
          <ProductCompactCard key={p.id} p={p} storeSlug={storeSlug} />
        ))}
      </div>
    );
  }
  if (layout === "magazine") {
    const [a, b, c, ...rest] = products;
    // Mobile path: hero full-width di atas, lalu semua sisanya
    // (b + c + rest) jadi grid 2-col yang rapih. Desktop tetap pola
    // editorial asimetris (big spans 2x2, b/c di kanan).
    if (forceMobile) {
      const tail = [b, c, ...rest].filter(Boolean) as StorefrontProduct[];
      return (
        <div className="flex flex-col gap-4">
          {a && (
            <ProductMagazineCard
              p={a}
              storeSlug={storeSlug}
              size="big"
              forceMobile
            />
          )}
          {tail.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {tail.map((p) => (
                <ProductMagazineCard key={p.id} p={p} storeSlug={storeSlug} />
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4 sm:gap-6">
        {(a || b || c) && (
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {a && (
              <div className="sm:col-span-2 sm:row-span-2">
                <ProductMagazineCard
                  p={a}
                  storeSlug={storeSlug}
                  size="big"
                />
              </div>
            )}
            {b && <ProductMagazineCard p={b} storeSlug={storeSlug} />}
            {c && <ProductMagazineCard p={c} storeSlug={storeSlug} />}
          </div>
        )}
        {rest.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <ProductCard key={p.id} p={p} storeSlug={storeSlug} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (layout === "feed") {
    return (
      <div
        className={cn(
          "mx-auto flex flex-col gap-6",
          !forceMobile && "max-w-md sm:max-w-lg",
        )}
      >
        {products.map((p) => (
          <ProductFeedCard key={p.id} p={p} storeSlug={storeSlug} />
        ))}
      </div>
    );
  }
  // Kiosk: 2 kolom, kartu besar touch-friendly, harga dominan
  if (layout === "kiosk") {
    return (
      <div className={cn("grid gap-3", forceMobile ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3")}>
        {products.map((p) => (
          <ProductKioskCard key={p.id} p={p} storeSlug={storeSlug} />
        ))}
      </div>
    );
  }
  // Katalog: 2 kolom dengan deskripsi singkat
  if (layout === "katalog") {
    return (
      <div className={cn("grid gap-4", forceMobile ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
        {products.map((p) => (
          <ProductKatalogCard key={p.id} p={p} storeSlug={storeSlug} />
        ))}
      </div>
    );
  }
  // Poster: 1 kolom penuh, gambar portrait besar
  if (layout === "poster") {
    return (
      <div className={cn("flex flex-col gap-5", !forceMobile && "max-w-sm sm:max-w-none sm:grid sm:grid-cols-2 sm:gap-5")}>
        {products.map((p) => (
          <ProductPosterCard key={p.id} p={p} storeSlug={storeSlug} />
        ))}
      </div>
    );
  }
  // Default: grid
  return (
    <div
      className={cn(
        "grid gap-4",
        forceMobile
          ? "grid-cols-2"
          : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {products.map((p) => (
        <ProductCard key={p.id} p={p} storeSlug={storeSlug} />
      ))}
    </div>
  );
}

// List item: horizontal layout, thumbnail di kiri + nama/harga/deskripsi
// di kanan. Cocok untuk toko dengan deskripsi panjang per produk.
function ProductListItem({
  p,
  storeSlug,
}: {
  p: StorefrontProduct;
  storeSlug: string;
}) {
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className="group flex gap-4 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 shadow-card transition-all hover:border-brand-300 hover:shadow-elevated sm:p-4"
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-neutral-100 sm:size-32">
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            width={160}
            height={160}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-400">
            <Package className="size-8" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium text-neutral-900 sm:text-base">
            {p.name}
          </p>
          {p.is_featured && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
              aria-label="Unggulan"
            >
              <Star className="size-2.5 fill-current" aria-hidden />
              Unggulan
            </span>
          )}
        </div>
        {p.description && (
          <p className="line-clamp-2 text-xs text-neutral-600 sm:text-sm">
            {p.description}
          </p>
        )}
        <div className="mt-auto flex items-baseline justify-between gap-2">
          <p className="font-display text-base font-semibold text-neutral-900 sm:text-lg">
            {formatRupiah(p.price_cents)}
          </p>
          {!shouldHideStock(p) && (
            <p className="text-xs text-neutral-500">
              {p.stock > 0 ? `Stok: ${p.stock}` : "Stok habis"}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// Hero card: produk pertama tampil full-width dengan foto besar + info di
// bawah. Untuk showcase layout (fashion/brand-forward).
function ProductHeroCard({
  p,
  storeSlug,
  forceMobile = false,
}: {
  p: StorefrontProduct;
  storeSlug: string;
  forceMobile?: boolean;
}) {
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className="group relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card transition-all hover:shadow-elevated"
    >
      <div
        className={cn(
          "relative overflow-hidden bg-neutral-100 aspect-[16/9]",
          !forceMobile && "sm:aspect-[2.4/1]",
        )}
      >
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            fill
            sizes="(max-width: 768px) 100vw, 1024px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-400">
            <Package className={cn(forceMobile ? "size-10" : "size-16")} aria-hidden />
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
        />
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex flex-col gap-1.5 text-white",
            forceMobile ? "p-3" : "gap-2 p-5 sm:p-7",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
              <Star
                className="size-3 fill-warning text-warning"
                aria-hidden
              />
              Sorotan
            </span>
          </div>
          <p
            className={cn(
              "line-clamp-2 font-display font-semibold leading-tight",
              forceMobile ? "text-sm" : "text-xl sm:text-2xl",
            )}
          >
            {p.name}
          </p>
          <div className="flex items-baseline justify-between gap-3">
            <p
              className={cn(
                "font-display font-semibold",
                forceMobile ? "text-sm" : "text-lg sm:text-2xl",
              )}
            >
              {formatRupiah(p.price_cents)}
            </p>
            {!shouldHideStock(p) && p.stock > 0 && (
              <p
                className={cn(
                  "opacity-90",
                  forceMobile ? "text-[10px]" : "text-xs",
                )}
              >
                Stok: {p.stock}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// Compact: thumbnail kecil, nama 1-line, harga prominent. Tidak ada
// deskripsi/stok untuk hemat vertical space — buyer klik untuk detail.
function ProductCompactCard({
  p,
  storeSlug,
}: {
  p: StorefrontProduct;
  storeSlug: string;
}) {
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            width={240}
            height={240}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-400">
            <Package className="size-6" aria-hidden />
          </div>
        )}
        {p.is_featured && (
          <span
            className="absolute left-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-warning/90 text-white"
            aria-label="Unggulan"
          >
            <Star className="size-2.5 fill-current" aria-hidden />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="line-clamp-1 text-xs font-medium text-neutral-800">
          {p.name}
        </p>
        <p className="font-display text-sm font-semibold text-neutral-900">
          {formatRupiah(p.price_cents)}
        </p>
      </div>
    </Link>
  );
}

// Magazine: asymmetric card. `size="big"` = 2x2 cell dengan foto lebar
// + caption mengambang di bawah. Default = single cell standar dengan
// foto square + info compact.
function ProductMagazineCard({
  p,
  storeSlug,
  size = "regular",
  forceMobile = false,
}: {
  p: StorefrontProduct;
  storeSlug: string;
  size?: "big" | "regular";
  forceMobile?: boolean;
}) {
  if (size === "big") {
    return (
      <Link
        href={`/${storeSlug}/product/${p.slug}`}
        className={cn(
          "group relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card transition-all hover:shadow-elevated",
          // h-full hanya boleh kalau parent benar-benar grid 2-row
          // yang ngasih tinggi. Di mobile (flex-col, no row span),
          // h-full=0 yang bikin card collapse.
          !forceMobile && "h-full",
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden bg-neutral-100",
            forceMobile
              ? "aspect-[4/3]"
              : "aspect-[4/3] sm:aspect-auto sm:h-full",
          )}
        >
          {p.photo_urls[0] ? (
            <Image
              src={p.photo_urls[0]}
              alt={p.name}
              fill
              sizes="(max-width: 768px) 100vw, 66vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-neutral-400">
              <Package className="size-12" aria-hidden />
            </div>
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
          />
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 flex flex-col gap-1 text-white",
              forceMobile ? "p-3" : "p-4 sm:p-5",
            )}
          >
            {p.is_featured && (
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                <Star className="size-2.5 fill-warning text-warning" aria-hidden />
                Pilihan
              </span>
            )}
            <p
              className={cn(
                "line-clamp-2 font-display font-semibold leading-tight",
                forceMobile ? "text-sm" : "text-lg sm:text-xl",
              )}
            >
              {p.name}
            </p>
            <p
              className={cn(
                "font-display font-semibold",
                forceMobile ? "text-sm" : "text-base sm:text-lg",
              )}
            >
              {formatRupiah(p.price_cents)}
            </p>
          </div>
        </div>
      </Link>
    );
  }
  // Regular (small cell)
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
    >
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            width={400}
            height={400}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-400">
            <Package className="size-8" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium text-neutral-900">
          {p.name}
        </p>
        <p className="font-display text-sm font-semibold text-neutral-900">
          {formatRupiah(p.price_cents)}
        </p>
      </div>
    </Link>
  );
}

// Feed: Instagram-style single-column. Foto square full-width + info
// di bawah. Cocok untuk produk yang merchandising-nya bergantung foto
// (fashion/makanan/aksesori).
function ProductFeedCard({
  p,
  storeSlug,
}: {
  p: StorefrontProduct;
  storeSlug: string;
}) {
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card transition-shadow hover:shadow-elevated"
    >
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            width={600}
            height={600}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-400">
            <Package className="size-16" aria-hidden />
          </div>
        )}
        {p.is_featured && (
          <span
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-warning/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white"
            aria-label="Unggulan"
          >
            <Star className="size-3 fill-current" aria-hidden />
            Unggulan
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <p className="line-clamp-2 font-display text-base font-semibold text-neutral-900 sm:text-lg">
          {p.name}
        </p>
        {p.description && (
          <p className="line-clamp-2 text-sm text-neutral-600">
            {p.description}
          </p>
        )}
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="font-display text-lg font-semibold text-neutral-900">
            {formatRupiah(p.price_cents)}
          </p>
          {!shouldHideStock(p) && p.stock > 0 && (
            <p className="text-xs text-neutral-500">Stok: {p.stock}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NEW LAYOUTS
// ─────────────────────────────────────────────────────────────────────

// Kiosk: touch-friendly 2-column, harga besar, cocok untuk kasir/menu kafe.
// Berbeda dari layout lain — punya inline add-to-cart stepper tanpa pindah halaman.
function ProductKioskCard({ p, storeSlug }: { p: StorefrontProduct; storeSlug: string }) {
  const cart = useOptionalCart();

  const cartKey = `${p.id}:`;
  const cartItem = cart?.items.find((x) => `${x.product_id}:${x.variant_id ?? ""}` === cartKey);
  const qty = cartItem?.qty ?? 0;
  const outOfStock = !shouldHideStock(p) && p.stock === 0;
  const atStockLimit = !shouldHideStock(p) && qty >= p.stock;

  function handleAdd() {
    if (outOfStock || !cart) return;
    cart.addItem({
      product_id: p.id,
      product_slug: p.slug,
      product_name: p.name,
      unit_price_cents: p.price_cents,
      qty: 1,
      photo_url: p.photo_urls[0],
      product_type: p.product_type ?? "physical",
      available_stock: p.stock,
    });
  }

  function handleDecrement() {
    if (!cart) return;
    if (qty <= 1) cart.removeItem(cartKey);
    else cart.setQty(cartKey, qty - 1);
  }

  function handleIncrement() {
    if (!cart || atStockLimit) return;
    cart.setQty(cartKey, qty + 1);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card transition-colors hover:border-brand-300">
      {/* Foto — tap buka detail produk */}
      <Link
        href={`/${storeSlug}/product/${p.slug}`}
        className="group relative block aspect-square overflow-hidden bg-neutral-100"
      >
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            fill
            sizes="(max-width: 640px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Package className="size-12 text-neutral-300" aria-hidden />
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700">
              Habis
            </span>
          </div>
        )}
        {qty > 0 && (
          <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
            {qty}
          </span>
        )}
      </Link>

      {/* Info + cart control */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-neutral-900">
            {p.name}
          </p>
          <p className="mt-1 font-display text-base font-bold text-brand-600">
            {formatRupiah(p.price_cents)}
          </p>
        </div>

        {qty === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock}
            className="mt-auto flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShoppingCart className="size-4" aria-hidden />
            Tambah
          </button>
        ) : (
          <div className="mt-auto flex h-9 w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDecrement}
              aria-label="Kurangi"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100 active:scale-90"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="min-w-[1.5rem] text-center text-sm font-bold text-brand-800 tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={atStockLimit}
              aria-label="Tambah"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100 active:scale-90 disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Katalog: 2-column horizontal card dengan deskripsi singkat. Cocok untuk
// toko yang butuh context lebih per produk.
function ProductKatalogCard({ p, storeSlug }: { p: StorefrontProduct; storeSlug: string }) {
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className="group flex gap-4 overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-card transition-all hover:border-brand-300 hover:shadow-elevated"
    >
      <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
        {p.photo_urls[0] ? (
          <Image
            src={p.photo_urls[0]}
            alt={p.name}
            fill
            sizes="112px"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Package className="size-8 text-neutral-300" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold text-neutral-900 line-clamp-2 leading-snug">{p.name}</p>
        {p.description && (
          <p className="line-clamp-2 text-xs text-neutral-500 leading-relaxed">{p.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2">
          <p className="font-display text-base font-bold text-neutral-900">{formatRupiah(p.price_cents)}</p>
          {!shouldHideStock(p) && p.stock > 0 && (
            <span className="text-xs text-neutral-400">Stok {p.stock}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Poster: portrait besar full-width, gambar 4:5, teks overlay di bawah.
// Cocok untuk fashion/premium/lifestyle dengan visual kuat.
function ProductPosterCard({ p, storeSlug }: { p: StorefrontProduct; storeSlug: string }) {
  return (
    <Link
      href={`/${storeSlug}/product/${p.slug}`}
      className="group relative overflow-hidden rounded-2xl bg-neutral-100 shadow-card transition-all hover:shadow-elevated active:scale-[0.99]"
      style={{ aspectRatio: "4/5" }}
    >
      {p.photo_urls[0] ? (
        <Image
          src={p.photo_urls[0]}
          alt={p.name}
          fill
          sizes="(max-width: 640px) 100vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Package className="size-16 text-neutral-300" aria-hidden />
        </div>
      )}
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 via-neutral-900/20 to-transparent" />
      {/* Info di bawah */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="line-clamp-2 font-display text-base font-semibold text-white leading-tight">{p.name}</p>
        <p className="mt-1.5 font-display text-lg font-bold text-white/95">{formatRupiah(p.price_cents)}</p>
        {!shouldHideStock(p) && p.stock === 0 && (
          <span className="mt-1 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            Stok habis
          </span>
        )}
      </div>
    </Link>
  );
}
