import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingCart } from "lucide-react";

import { Container } from "@/components/layout/container";
import { CartView } from "@/components/storefront/cart-view";
import { themeStyleForHue } from "@/lib/storefront-theme";

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

type StoreSummary = {
  id: string;
  slug: string;
  name: string;
  whatsapp_number: string;
  is_open: boolean;
  accepting_orders?: boolean;
  accepting_orders_reason?: "" | "store_closed" | "order_limit";
  theme_hue: number;
};

async function fetchStore(slug: string): Promise<StoreSummary | null> {
  try {
    const res = await fetch(`${apiBase}/api/v1/storefront/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { store: StoreSummary };
    return data.store ?? null;
  } catch {
    return null;
  }
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchStore(slug);
  return {
    title: store ? `Keranjang — ${store.name}` : "Keranjang",
  };
}

export default async function KeranjangPage({ params }: { params: Params }) {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) notFound();

  return (
    <div
      className="min-h-svh bg-neutral-50"
      style={themeStyleForHue(store.theme_hue)}
    >
      <header className="border-b border-neutral-200 bg-white">
        <Container>
          <div className="flex h-14 items-center justify-between gap-3">
            <Link
              href={`/${store.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {store.name}
            </Link>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
              <ShoppingCart className="size-4 text-brand-600" aria-hidden />
              Keranjang
            </div>
          </div>
        </Container>
      </header>

      <main className="py-8 lg:py-12">
        <Container>
          <div className="mx-auto max-w-2xl">
            <CartView
              storeSlug={store.slug}
              storeName={store.name}
              storeWhatsApp={store.whatsapp_number}
              storeOpen={store.is_open}
              acceptingOrders={store.accepting_orders ?? store.is_open}
              acceptingOrdersReason={store.accepting_orders_reason ?? ""}
            />
          </div>
        </Container>
      </main>
    </div>
  );
}
