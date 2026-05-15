"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Zap, Check, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { useCart, type CartItem } from "./cart-context";

type StorefrontVariant = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
};

const EMPTY_VARIANTS: StorefrontVariant[] = [];

type Props = {
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  product: {
    id: string;
    slug: string;
    name: string;
    price_cents: number;
    stock: number;
    has_variants: boolean;
    photo_urls?: string[];
    product_type?: "physical" | "digital";
  };
  variants?: StorefrontVariant[];
  isOpen: boolean;
  acceptingOrders: boolean;
  acceptingOrdersReason: "" | "store_closed" | "order_limit";
};

// Compact "add to cart" panel that replaces the long single-purchase
// form on the product page. Buyer picks variant + qty, then either
// (a) keeps shopping (Tambah ke Keranjang) or (b) jumps straight to
// the wizard (Beli Sekarang). Customer info / shipping / payment are
// gathered in /checkout, not here.
export function AddToCartPanel({
  storeSlug,
  storeName,
  storeWhatsApp,
  product,
  variants = EMPTY_VARIANTS,
  isOpen,
  acceptingOrders,
  acceptingOrdersReason,
}: Props) {
  const { push } = useRouter();
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<string>("");
  const [justAdded, setJustAdded] = useState(false);

  const isDigital = product.product_type === "digital";
  const selectedVariant = product.has_variants
    ? variants.find((v) => v.id === variantId) ?? null
    : null;

  const unitPriceCents = selectedVariant
    ? selectedVariant.price_cents
    : product.price_cents;
  const availableStock = isDigital
    ? Number.MAX_SAFE_INTEGER
    : product.has_variants
      ? selectedVariant?.stock ?? 0
      : product.stock;
  const subtotal = unitPriceCents * qty;

  const outOfStock =
    !isDigital &&
    (product.has_variants
      ? variants.every((v) => v.stock <= 0)
      : product.stock <= 0);
  const variantNotPicked = product.has_variants && !selectedVariant;
  const orderLimitReached = acceptingOrdersReason === "order_limit";
  // Toko-tutup TIDAK lagi disable tombol pesan. Pembeli tetap boleh
  // checkout — pesanan masuk antrian dan diproses seller saat buka.
  // Variant disabled via Select tetap berlaku (variant kosong stoknya
  // tidak masuk akal di-add).
  const disabled = !acceptingOrders || outOfStock || variantNotPicked;

  function buildItem(): CartItem {
    return {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      variant_id: selectedVariant?.id,
      variant_name: selectedVariant?.name,
      unit_price_cents: unitPriceCents,
      qty,
      photo_url: product.photo_urls?.[0],
      product_type: isDigital ? "digital" : "physical",
      available_stock: availableStock === Number.MAX_SAFE_INTEGER ? 0 : availableStock,
    };
  }

  function handleAdd() {
    if (disabled) return;
    addItem(buildItem());
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }

  function handleBuyNow() {
    if (disabled) return;
    addItem(buildItem());
    push(`/${storeSlug}/checkout`);
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Pesan Sekarang</h2>
        </div>
        {isDigital && (
          <Badge variant="brand" className="gap-1">
            <Download className="size-3" aria-hidden />
            Digital
          </Badge>
        )}
      </div>

      <div className="mt-1">
        <p className="text-xs text-neutral-500">
          {isDigital
            ? "Pelanggan dapat link akses setelah pembayaran lunas."
            : "Ongkir dihitung otomatis di checkout."}
        </p>
      </div>

      {orderLimitReached ? (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-neutral-700">
          <p>
            <strong>Penjual sementara tidak menerima pesanan baru.</strong>{" "}
            Untuk pemesanan atau info lebih lanjut, silakan hubungi langsung
            admin toko.
          </p>
          {storeWhatsApp && (
            <a
              href={waLink(
                storeWhatsApp,
                `Halo ${storeName}, saya tertarik dengan produk "${product.name}". Boleh tanya soal pemesanannya?`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Chat Admin Toko
            </a>
          )}
        </div>
      ) : !isOpen ? (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-neutral-700">
          Toko sedang tutup — pesanan kamu tetap masuk dan diproses saat toko
          buka kembali.
        </div>
      ) : null}

      {/* Variant picker */}
      {product.has_variants && variants.length > 0 && (
        <div className="mt-5 flex flex-col gap-1.5">
          <Label htmlFor="variant_id">
            Pilih Varian <span className="text-danger">*</span>
          </Label>
          <Select
            id="variant_id"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            disabled={false}
          >
            <option value="">- Pilih varian -</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                {v.name} - {formatRupiah(v.price_cents)}
                {v.stock <= 0 ? " (Habis)" : ""}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Qty stepper */}
      <div className="mt-5 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-900">Jumlah</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Kurangi"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={disabled || qty <= 1}
            className="flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40"
          >
            −
          </button>
          <span className="w-8 text-center font-mono text-sm font-semibold">
            {qty}
          </span>
          <button
            type="button"
            aria-label="Tambah"
            onClick={() =>
              setQty((q) =>
                isDigital
                  ? q + 1
                  : Math.min(q + 1, availableStock || q + 1),
              )
            }
            disabled={disabled || (!isDigital && qty >= availableStock)}
            className="flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {!isDigital && availableStock > 0 && availableStock <= 5 && (
        <p className="mt-2 text-xs font-medium text-warning">
          Sisa stok tinggal {availableStock} pcs
        </p>
      )}

      <div className="mt-4 flex items-baseline justify-between border-t border-neutral-200 pt-4">
        <span className="text-sm text-neutral-600">Subtotal</span>
        <span className="font-display text-lg font-semibold text-neutral-900">
          {formatRupiah(subtotal)}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button
          type="button"
          size="md"
          onClick={handleBuyNow}
          disabled={disabled}
          className="w-full"
        >
          <Zap className="size-4" aria-hidden />
          Beli Sekarang
        </Button>
        <Button
          type="button"
          size="md"
          variant="outline"
          onClick={handleAdd}
          disabled={disabled}
          className={cn(
            "w-full transition-colors",
            justAdded && "border-success text-success",
          )}
        >
          {justAdded ? (
            <>
              <Check className="size-4" aria-hidden />
              Ditambahkan ke keranjang
            </>
          ) : (
            <>
              <ShoppingCart className="size-4" aria-hidden />
              Tambah ke Keranjang
            </>
          )}
        </Button>
      </div>

      {variantNotPicked && (
        <p className="mt-2 text-center text-xs text-neutral-500">
          Pilih varian dulu untuk lanjut
        </p>
      )}
    </Card>
  );
}
