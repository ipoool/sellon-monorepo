"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Package, Star } from "lucide-react";

import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

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
};

type StorefrontCategory = {
  id: string;
  name: string;
};

type Props = {
  storeSlug: string;
  products: StorefrontProduct[];
  categories: StorefrontCategory[];
};

export function StorefrontCatalog({ storeSlug, products, categories }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");

  // Categories with at least 1 product
  const usedCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.category_id)
        counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return categories
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0);
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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-xl font-semibold text-neutral-900">
            Produk
          </h2>
          <span className="text-sm text-neutral-500">
            {filtered.length}
            {(query || activeCategoryId) && filtered.length !== products.length
              ? ` dari ${products.length}`
              : ""}{" "}
            item
          </span>
        </div>
        <div className="relative w-full sm:w-72">
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
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
        <div className="rounded-xl border border-neutral-200 bg-white py-16 text-center shadow-card">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Package className="size-6" aria-hidden />
          </div>
          <p className="mt-4 font-medium text-neutral-900">
            {query || activeCategoryId
              ? "Tidak ada produk yang cocok"
              : "Belum ada produk"}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {query || activeCategoryId
              ? "Coba ubah kata kunci atau pilih kategori lain."
              : "Toko-mu sedang menyiapkan produk-produknya. Cek lagi nanti ya!"}
          </p>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {gridProducts.map((p) => (
                <ProductCard key={p.id} p={p} storeSlug={storeSlug} />
              ))}
            </div>
          )}
        </>
      )}
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
      href={`/${storeSlug}/produk/${p.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated",
        featured ? "border-warning/30" : "border-neutral-200",
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        {p.photo_urls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.photo_urls[0]}
            alt={p.name}
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
        <p className="mt-1 text-xs text-neutral-500">
          {p.stock > 0 ? `Stok: ${p.stock}` : "Stok habis"}
        </p>
      </div>
    </Link>
  );
}
