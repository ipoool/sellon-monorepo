import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { Container } from "@/components/layout/container";
import { CheckoutWizard } from "@/components/storefront/checkout-wizard";
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

type StorefrontPayment = {
  has_midtrans: boolean;
  midtrans_methods: string[];
  has_manual_bank: boolean;
  has_qris_static: boolean;
  bank_count: number;
};

async function fetchStorefront(slug: string): Promise<{
  store: StoreSummary;
  payment: StorefrontPayment;
} | null> {
  try {
    const res = await fetch(`${apiBase}/api/v1/storefront/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      store: StoreSummary;
      payment: StorefrontPayment;
    };
    return data;
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
  const data = await fetchStorefront(slug);
  return {
    title: data ? `Checkout — ${data.store.name}` : "Checkout",
  };
}

export default async function CheckoutPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await fetchStorefront(slug);
  if (!data) notFound();

  const { store, payment } = data;

  return (
    <div
      className="min-h-svh bg-neutral-50"
      style={themeStyleForHue(store.theme_hue)}
    >
      <header className="border-b border-neutral-200 bg-white">
        <Container>
          <div className="flex h-14 items-center justify-between gap-3">
            <Link
              href={`/${store.slug}/cart`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Keranjang
            </Link>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              Checkout aman
            </div>
          </div>
        </Container>
      </header>

      <main className="py-8 lg:py-12">
        <Container>
          <div className="mx-auto max-w-3xl">
            <CheckoutWizard
              storeSlug={store.slug}
              storeName={store.name}
              storeWhatsApp={store.whatsapp_number}
              storeOpen={store.is_open}
              acceptingOrders={store.accepting_orders ?? store.is_open}
              acceptingOrdersReason={store.accepting_orders_reason ?? ""}
              payment={payment}
            />
          </div>
        </Container>
      </main>
    </div>
  );
}
