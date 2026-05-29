"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Package, LayoutGrid, ChevronDown, Loader2 } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePOS } from "./pos-context";
import { CategoryPickerModal } from "./category-picker-modal";
import { OptionPickerModal } from "./option-picker-modal";
import { showError } from "@/lib/toast";
import type { Product, Category } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  products: Product[];
  categories: Category[];
};

export function ProductGrid({ products, categories }: Props) {
  const { addToCart, isTouch } = usePOS();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(""); // "" = all
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeCategoryName =
    activeCategory === ""
      ? "Semua Kategori"
      : (categories.find((c) => c.id === activeCategory)?.name ?? "Kategori");

  // Auto-focus search on mount + on F2.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qUpper = q.toUpperCase();
    const qRaw = query.trim();
    return products.filter((p) => {
      if (activeCategory && p.category_id !== activeCategory) return false;
      if (q) {
        const barcodeVal = p.id.replace(/-/g, "").slice(0, 12).toUpperCase();
        const matchesGtin = !!p.gtin && p.gtin.includes(qRaw);
        if (
          !p.name.toLowerCase().includes(q) &&
          !barcodeVal.startsWith(qUpper) &&
          !matchesGtin
        ) {
          return false;
        }
      }
      return true;
    });
  }, [products, query, activeCategory]);

  // Barcode scanner: USB scanners type fast + send Enter. We match either a
  // real GTIN (8–14 digits, exact match on product.gtin) or the printable
  // product-id hex code (12 hex chars). On a single exact match, auto-add.
  useEffect(() => {
    const raw = query.trim();
    if (!raw) return;

    if (/^\d{8,14}$/.test(raw)) {
      const matches = products.filter((p) => p.gtin && p.gtin === raw);
      if (matches.length === 1) {
        selectProduct(matches[0]);
        setQuery("");
        return;
      }
    }

    const up = raw.toUpperCase();
    if (up.length === 12 && /^[0-9A-F]+$/.test(up)) {
      const matches = products.filter(
        (p) => p.id.replace(/-/g, "").slice(0, 12).toUpperCase() === up,
      );
      if (matches.length === 1) {
        selectProduct(matches[0]);
        setQuery("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const needsPicker = (p: Product) =>
    p.has_variants ||
    p.takeaway_enabled ||
    (p.modifiers && p.modifiers.length > 0);

  // Open the variant/option picker. The list payload omits the full variants[]
  // array (N+1 avoidance), so for variant products we fetch the product detail
  // first to hydrate variants before showing the picker. Modifiers are already
  // present in the list payload.
  const openPicker = async (p: Product) => {
    if (!p.has_variants) {
      setPickerProduct(p);
      return;
    }
    setLoadingId(p.id);
    try {
      const res = await fetch(`${apiBase}/api/v1/products/${p.id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        showError("Gagal memuat varian produk");
        return;
      }
      const data = await res.json();
      setPickerProduct(data.product as Product);
    } catch {
      showError("Gagal memuat varian produk");
    } finally {
      setLoadingId(null);
    }
  };

  // Add a product to the cart, or open the variant/option picker first when
  // the product needs a choice. Shared by tap + barcode/GTIN scan.
  const selectProduct = (p: Product) => {
    if (needsPicker(p)) {
      openPicker(p);
      return;
    }
    addToCart({
      product_id: p.id,
      variant_id: null,
      product_name: p.name,
      product_type: p.product_type,
      unit_cents: p.price_cents,
      quantity: 1,
      photo_url: p.photo_urls?.[0],
      stock: p.stock,
      discounts: p.discounts,
    });
  };

  const handleAdd = (p: Product) => selectProduct(p);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search + filter (sejajar) */}
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-white p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isTouch
                ? "Cari produk atau scan barcode..."
                : "Cari produk atau scan barcode... (F2)"
            }
            className="h-12 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-11 pr-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        {categories.length > 0 && (
          <button
            onClick={() => setShowCatPicker(true)}
            className={cn(
              "inline-flex h-12 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors",
              activeCategory === ""
                ? "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100",
            )}
          >
            <LayoutGrid className="size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="hidden max-w-[12rem] truncate sm:inline">{activeCategoryName}</span>
            <ChevronDown className="size-4 shrink-0 text-neutral-400" aria-hidden />
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">
            Tidak ada produk yang cocok.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((p) => {
              const stockVal = p.has_variants ? (p.variants_stock ?? 0) : p.stock;
              const outOfStock = p.product_type !== "digital" && stockVal <= 0;
              const loading = loadingId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleAdd(p)}
                  disabled={outOfStock || loading}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card active:translate-y-0 active:bg-brand-50/40 disabled:opacity-50 disabled:hover:translate-y-0",
                  )}
                >
                  {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                      <Loader2 className="size-6 animate-spin text-brand-600" aria-hidden />
                    </div>
                  )}
                  <div className="flex aspect-square items-center justify-center bg-neutral-100">
                    {p.photo_urls?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_urls[0]} alt={p.name} className="size-full object-cover" />
                    ) : (
                      <Package className="size-9 text-neutral-400" aria-hidden />
                    )}
                  </div>
                  <div className="flex-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900 group-hover:text-brand-700">
                      {p.name}
                    </p>
                    <p className="mt-1.5 text-base font-bold text-neutral-900">
                      {p.has_variants ? `Mulai ${formatRupiah(p.price_cents)}` : formatRupiah(p.price_cents)}
                    </p>
                    {p.product_type !== "digital" && (
                      <p className={cn("mt-0.5 text-xs", outOfStock ? "text-danger" : "text-neutral-400")}>
                        Stok: {stockVal}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <CategoryPickerModal
        open={showCatPicker}
        categories={categories}
        active={activeCategory}
        onSelect={(id) => {
          setActiveCategory(id);
          setShowCatPicker(false);
        }}
        onClose={() => setShowCatPicker(false)}
      />

      {pickerProduct && (
        <OptionPickerModal
          product={pickerProduct}
          onClose={() => setPickerProduct(null)}
        />
      )}
    </div>
  );
}
