"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Package,
  Star,
  Loader2,
  X,
  ShoppingCart,
  Zap,
  Download,
  ExternalLink,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatRupiah } from "@/lib/format";
import { showError } from "@/lib/toast";
import type { Product, Variant } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  open: boolean;
  productId: string;
  storeSlug?: string;
  onClose: () => void;
};

// Renders the product the way a buyer would see it on the public storefront,
// inside a dialog. Layout mirrors /[slug]/product/[productSlug]/page.tsx so
// sellers can sanity-check copy + photos without leaving the dashboard.
//
// Buy/cart buttons are rendered but disabled — this is a read-only preview.
export function ProductPreviewDialog({
  open,
  productId,
  storeSlug,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [variantId, setVariantId] = useState<string>("");

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d) onClose();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, [onClose]);

  // Re-fetch each time the dialog opens so edits made in another tab
  // surface immediately. No caching: this is a debug/preview path, not
  // a hot read.
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    setActivePhotoIdx(0);
    setVariantId("");
    fetch(`${apiBase}/api/v1/products/${productId}`, {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setProduct(data.product as Product);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        showError(err);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, productId]);

  const variants = product?.variants ?? [];
  const isDigital = product?.product_type === "digital";
  const selectedVariant: Variant | null =
    product?.has_variants
      ? variants.find((v) => v.id === variantId) ?? null
      : null;
  const displayPriceCents = selectedVariant
    ? selectedVariant.price_cents
    : product?.has_variants && variants.length > 0
      ? Math.min(...variants.map((v) => v.price_cents))
      : (product?.price_cents ?? 0);
  const minPriceLabel =
    product?.has_variants && variants.length > 1 && !selectedVariant
      ? `Mulai ${formatRupiah(displayPriceCents)}`
      : formatRupiah(displayPriceCents);
  const totalStock = product?.has_variants
    ? variants.reduce((s, v) => s + v.stock, 0)
    : (product?.stock ?? 0);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="product-preview-title"
      className="fixed left-1/2 top-1/2 m-0 max-h-[92vh] w-[min(960px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-0 shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <Badge variant="brand">Preview POV Pembeli</Badge>
          <p className="text-xs text-neutral-600">
            Tampilan persis seperti yang dilihat customer di toko publik.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {storeSlug && product && (
            <a
              href={`/${storeSlug}/product/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Buka di toko
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup preview"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="max-h-[calc(92vh-49px)] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-neutral-500">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <span className="ml-2">Memuat preview…</span>
          </div>
        ) : product ? (
          <div className="grid gap-6 p-6 lg:grid-cols-12">
            {/* Photos */}
            <div className="lg:col-span-7">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                {product.photo_urls[activePhotoIdx] ? (
                  <Image
                    src={product.photo_urls[activePhotoIdx]}
                    alt={product.name}
                    fill
                    sizes="(max-width: 1024px) 95vw, 540px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-neutral-400">
                    <Package className="size-16" aria-hidden />
                  </div>
                )}
              </div>
              {product.photo_urls.length > 1 && (
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {product.photo_urls.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActivePhotoIdx(i)}
                      className={
                        "relative aspect-square overflow-hidden rounded-lg border-2 transition-colors " +
                        (i === activePhotoIdx
                          ? "border-brand-500"
                          : "border-neutral-200 hover:border-neutral-300")
                      }
                      aria-label={`Lihat foto ${i + 1}`}
                    >
                      <Image
                        src={url}
                        alt={`${product.name} foto ${i + 1}`}
                        fill
                        sizes="100px"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Detail */}
            <div className="lg:col-span-5">
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="product-preview-title"
                    className="font-display text-xl font-semibold tracking-tight text-neutral-900"
                  >
                    {product.name}
                  </h2>
                  {product.is_featured && (
                    <Badge variant="warning" className="shrink-0 gap-1">
                      <Star className="size-3 fill-warning" aria-hidden />
                      Unggulan
                    </Badge>
                  )}
                </div>
                <p className="mt-3 font-display text-2xl font-semibold text-neutral-900">
                  {minPriceLabel}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {isDigital ? (
                    <Badge variant="brand" className="gap-1">
                      <Download className="size-3" aria-hidden />
                      Digital
                    </Badge>
                  ) : totalStock > 0 ? (
                    <Badge variant="success">Stok {totalStock}</Badge>
                  ) : (
                    <Badge variant="warning">Stok habis</Badge>
                  )}
                  {product.has_variants && variants.length > 0 && (
                    <Badge variant="default">
                      {variants.length} varian
                    </Badge>
                  )}
                </div>

                {product.description && (
                  <div className="mt-5 border-t border-neutral-200 pt-4">
                    <h3 className="text-sm font-semibold text-neutral-900">
                      Deskripsi
                    </h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-700">
                      {product.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Buyer-style purchase panel — disabled in preview mode. */}
              <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-card">
                <div className="flex items-center gap-2">
                  <ShoppingCart
                    className="size-4 text-brand-600"
                    aria-hidden
                  />
                  <h3 className="font-semibold text-neutral-900">
                    Pesan Sekarang
                  </h3>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {isDigital
                    ? "Pelanggan dapat link akses setelah pembayaran lunas."
                    : "Ongkir dihitung otomatis di checkout."}
                </p>

                {product.has_variants && variants.length > 0 && (
                  <div className="mt-4 flex flex-col gap-1.5">
                    <Label htmlFor="preview_variant">
                      Pilih Varian{" "}
                      <span className="text-danger">*</span>
                    </Label>
                    <Select
                      id="preview_variant"
                      value={variantId}
                      onChange={(e) => setVariantId(e.target.value)}
                    >
                      <option value="">- Pilih varian -</option>
                      {variants.map((v) => (
                        <option
                          key={v.id}
                          value={v.id}
                          disabled={!isDigital && v.stock <= 0}
                        >
                          {v.name} - {formatRupiah(v.price_cents)}
                          {!isDigital && v.stock <= 0 ? " (Habis)" : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    type="button"
                    size="md"
                    disabled
                    className="w-full opacity-70"
                    title="Mode preview - tombol dinonaktifkan"
                  >
                    <Zap className="size-4" aria-hidden />
                    Beli Sekarang
                  </Button>
                  <Button
                    type="button"
                    size="md"
                    variant="outline"
                    disabled
                    className="w-full opacity-70"
                    title="Mode preview - tombol dinonaktifkan"
                  >
                    <ShoppingCart className="size-4" aria-hidden />
                    Tambah ke Keranjang
                  </Button>
                </div>
                <p className="mt-2 text-center text-[11px] text-neutral-500">
                  Mode preview - tombol pesan tidak aktif.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
