"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Package } from "lucide-react";

import { formatRupiah } from "@/lib/format";

type StorefrontProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock: number;
  photo_urls: string[];
};

type Props = {
  storeSlug: string;
  products: StorefrontProduct[];
};

export function StorefrontCatalog({ storeSlug, products }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      (p.name + " " + p.description).toLowerCase().includes(q),
    );
  }, [query, products]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-xl font-semibold text-neutral-900">
            Produk
          </h2>
          <span className="text-sm text-neutral-500">
            {filtered.length}
            {query && filtered.length !== products.length
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

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white py-16 text-center shadow-card">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Package className="size-6" aria-hidden />
          </div>
          <p className="mt-4 font-medium text-neutral-900">
            {query ? "Tidak ada produk yang cocok" : "Belum ada produk"}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {query
              ? "Coba kata kunci lain atau kosongkan kotak pencarian."
              : "Toko-mu sedang menyiapkan produk-produknya. Cek lagi nanti ya!"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/${storeSlug}/produk/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
            >
              <div className="aspect-square overflow-hidden bg-neutral-100">
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
          ))}
        </div>
      )}
    </>
  );
}
