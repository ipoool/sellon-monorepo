import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { AddToCartPanel } from "@/components/storefront/add-to-cart-panel";
import { BuyerShareButton } from "@/components/storefront/buyer-share-button";
import { ProductPhotoGallery } from "@/components/storefront/product-photo-gallery";
import { formatRupiah } from "@/lib/format";
import { themeStyleForHue } from "@/lib/storefront-theme";

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

type Store = {
  slug: string;
  name: string;
  whatsapp_number: string;
  is_open: boolean;
  accepting_orders?: boolean;
  accepting_orders_reason?: "" | "store_closed" | "order_limit";
  theme_hue?: number;
};
type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock: number;
  photo_urls: string[];
  has_variants: boolean;
  product_type?: "physical" | "digital";
};

type StorefrontVariant = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
};

type StorefrontPayment = {
  has_midtrans: boolean;
  midtrans_methods: string[];
  has_manual_bank: boolean;
  has_qris_static: boolean;
  bank_count: number;
};

async function fetchProduct(
  slug: string,
  productSlug: string,
): Promise<{
  store: Store;
  product: Product;
  variants: StorefrontVariant[];
  payment?: StorefrontPayment;
} | null> {
  try {
    const res = await fetch(
      `${apiBase}/api/v1/storefront/${slug}/products/${productSlug}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const data = await fetchProduct(slug, productSlug);
  if (!data) return { title: "Produk tidak ditemukan" };
  return {
    title: `${data.product.name} — ${data.store.name}`,
    description: data.product.description.slice(0, 160),
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const data = await fetchProduct(slug, productSlug);
  if (!data) notFound();
  const { store, product, variants = [], payment } = data;
  const totalStock = product.has_variants
    ? variants.reduce((sum, v) => sum + v.stock, 0)
    : product.stock;
  // Hide the stock badge for digital items (no real inventory) and for
  // sellers using a sentinel "unlimited" stock (>= 9999) — buyers don't
  // need a count there. Physical products still see "Stok N" / "Stok habis".
  const hideStockBadge =
    product.product_type === "digital" || totalStock >= 9999;
  const minPrice = product.has_variants && variants.length > 0
    ? Math.min(...variants.map((v) => v.price_cents))
    : product.price_cents;

  return (
    <div
      className="min-h-svh bg-neutral-50"
      style={themeStyleForHue(store.theme_hue)}
    >
      <header className="border-b border-neutral-200 bg-white">
        <Container>
          <div className="flex h-14 items-center gap-3">
            <Link
              href={`/${slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {store.name}
            </Link>
          </div>
        </Container>
      </header>

      <main className="py-6 pb-24 lg:py-10 lg:pb-10">
        <Container>
          <div className="grid gap-8 lg:grid-cols-12">
            {/* Photos */}
            <div className="lg:col-span-7">
              <ProductPhotoGallery
                photoUrls={product.photo_urls}
                productName={product.name}
              />
            </div>

            {/* Detail + checkout */}
            <div className="lg:col-span-5">
              <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-card">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                  {product.name}
                </h1>
                <p className="mt-3 font-display text-3xl font-semibold text-neutral-900">
                  {product.has_variants && variants.length > 1
                    ? `Mulai ${formatRupiah(minPrice)}`
                    : formatRupiah(minPrice)}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {!hideStockBadge &&
                      (totalStock > 0 ? (
                        <Badge variant="success">Stok {totalStock}</Badge>
                      ) : (
                        <Badge variant="warning">Stok habis</Badge>
                      ))}
                    {product.has_variants && (
                      <Badge variant="brand">{variants.length} varian</Badge>
                    )}
                  </div>
                  <BuyerShareButton
                    productName={product.name}
                    storeName={store.name}
                    priceLabel={
                      product.has_variants && variants.length > 1
                        ? `mulai ${formatRupiah(minPrice)}`
                        : formatRupiah(minPrice)
                    }
                  />
                </div>

                {product.description && (
                  <div className="mt-5 border-t border-neutral-200 pt-5">
                    <h2 className="text-sm font-semibold text-neutral-900">
                      Deskripsi
                    </h2>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-700">
                      {product.description}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <AddToCartPanel
                  storeSlug={store.slug}
                  storeName={store.name}
                  storeWhatsApp={store.whatsapp_number}
                  product={{
                    id: product.id,
                    slug: product.slug,
                    name: product.name,
                    price_cents: product.price_cents,
                    stock: product.stock,
                    has_variants: product.has_variants,
                    photo_urls: product.photo_urls,
                    product_type: product.product_type,
                  }}
                  variants={variants}
                  isOpen={store.is_open}
                  acceptingOrders={store.accepting_orders ?? store.is_open}
                  acceptingOrdersReason={store.accepting_orders_reason ?? ""}
                />
              </div>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
