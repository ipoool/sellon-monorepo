import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { BuyerShareButton } from "@/components/storefront/buyer-share-button";
import { formatRupiah } from "@/lib/format";

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

type Store = {
  slug: string;
  name: string;
  whatsapp_number: string;
  is_open: boolean;
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
  const minPrice = product.has_variants && variants.length > 0
    ? Math.min(...variants.map((v) => v.price_cents))
    : product.price_cents;

  return (
    <div className="min-h-svh bg-neutral-50">
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

      <main className="py-6 lg:py-10">
        <Container>
          <div className="grid gap-8 lg:grid-cols-12">
            {/* Photos */}
            <div className="lg:col-span-7">
              <div className="aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                {product.photo_urls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.photo_urls[0]}
                    alt={product.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-neutral-400">
                    <Package className="size-16" aria-hidden />
                  </div>
                )}
              </div>
              {product.photo_urls.length > 1 && (
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {product.photo_urls.slice(1).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`${product.name} foto ${i + 2}`}
                      className="aspect-square w-full rounded-lg border border-neutral-200 object-cover"
                    />
                  ))}
                </div>
              )}
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
                    {totalStock > 0 ? (
                      <Badge variant="success">Stok {totalStock}</Badge>
                    ) : (
                      <Badge variant="warning">Stok habis</Badge>
                    )}
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
                <CheckoutForm
                  storeSlug={store.slug}
                  storeName={store.name}
                  storeWhatsApp={store.whatsapp_number}
                  product={{
                    id: product.id,
                    name: product.name,
                    price_cents: product.price_cents,
                    stock: product.stock,
                    has_variants: product.has_variants,
                  }}
                  variants={variants}
                  isOpen={store.is_open}
                  payment={payment}
                />
              </div>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
