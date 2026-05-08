import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Package,
  MessageCircle,
  MapPin,
  ExternalLink,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatRupiah } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

type StorefrontStore = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo_url: string;
  category: string;
  city: string;
  whatsapp_number: string;
  instagram: string;
  tiktok: string;
  is_open: boolean;
};

type StorefrontProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock: number;
  photo_urls: string[];
};

type StorefrontData = {
  store: StorefrontStore;
  products: StorefrontProduct[];
};

async function fetchStorefront(slug: string): Promise<StorefrontData | null> {
  try {
    const res = await fetch(`${apiBase}/api/v1/storefront/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as StorefrontData;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchStorefront(slug);
  if (!data) return { title: "Toko tidak ditemukan — SellOn" };
  return {
    title: `${data.store.name} — SellOn`,
    description: data.store.description || `Katalog ${data.store.name} di SellOn.`,
  };
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await fetchStorefront(slug);
  if (!data) notFound();
  const { store, products } = data;

  return (
    <div className="min-h-svh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <Container>
          <div className="flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:gap-6">
            <Avatar src={store.logo_url} name={store.name} size="lg" className="size-16 text-xl" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                  {store.name}
                </h1>
                {store.is_open ? (
                  <Badge variant="success">Buka</Badge>
                ) : (
                  <Badge variant="warning">Tutup</Badge>
                )}
              </div>
              {store.description && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {store.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-600">
                {store.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden />
                    {store.city}
                  </span>
                )}
                {store.category && (
                  <span className="inline-flex items-center gap-1">
                    <Package className="size-3.5" aria-hidden />
                    {store.category}
                  </span>
                )}
                {store.whatsapp_number && (
                  <a
                    href={waLink(store.whatsapp_number, `Halo ${store.name}, saya mau tanya...`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-success hover:underline"
                  >
                    <MessageCircle className="size-3.5" aria-hidden />
                    Chat WhatsApp
                  </a>
                )}
                {store.instagram && (
                  <a
                    href={`https://instagram.com/${store.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-neutral-900"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Instagram {store.instagram}
                  </a>
                )}
                {store.tiktok && (
                  <a
                    href={`https://tiktok.com/@${store.tiktok.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-neutral-900"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    TikTok {store.tiktok}
                  </a>
                )}
              </div>
            </div>
          </div>
        </Container>
      </header>

      <main className="py-8 lg:py-12">
        <Container>
          {!store.is_open && (
            <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
              <strong>Toko sedang tutup.</strong> Anda masih bisa lihat produk,
              tapi pesanan baru sementara tidak diterima.
            </div>
          )}

          {products.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white py-16 text-center shadow-card">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                <Package className="size-6" aria-hidden />
              </div>
              <p className="mt-4 font-medium text-neutral-900">Belum ada produk</p>
              <p className="mt-1 text-sm text-neutral-600">
                Toko-mu sedang menyiapkan produk-produknya. Cek lagi nanti ya!
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="font-display text-xl font-semibold text-neutral-900">
                  Produk
                </h2>
                <span className="text-sm text-neutral-500">{products.length} item</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <Link
                    key={p.id}
                    href={`/${slug}/produk/${p.slug}`}
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
            </>
          )}
        </Container>
      </main>

      <footer className="border-t border-neutral-200 bg-white py-6">
        <Container>
          <p className="text-center text-xs text-neutral-500">
            Toko ini ditenagai oleh{" "}
            <Link href="/" className="font-medium text-brand-600 hover:text-brand-700">
              SellOn
            </Link>
            . Bayar bulanan, tanpa potongan transaksi.
          </p>
        </Container>
      </footer>
    </div>
  );
}
