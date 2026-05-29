import { notFound } from "next/navigation";

import { SelfOrderFlow } from "@/components/storefront/self-order-flow";
import { themeStyleForHue } from "@/lib/storefront-theme";

export const metadata = { title: "Pesan — SellOn" };

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

type Resolution = {
  store_slug: string;
  store_name: string;
  table_id: string;
  table_label: string;
  payment_mode: "cashier" | "online";
  dinein_enabled: boolean;
};

type SelfOrderProduct = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
  photo_urls: string[];
  has_variants: boolean;
  product_type: string;
};

export default async function TableOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const resRes = await fetch(`${apiBase}/api/v1/tables/resolve/${token}`, { cache: "no-store" });
  if (!resRes.ok) notFound();
  const res = (await resRes.json()) as Resolution;
  if (!res.dinein_enabled) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-neutral-50 p-6 text-center">
        <p className="text-neutral-600">Pemesanan via QR sedang tidak aktif di toko ini.</p>
      </div>
    );
  }

  const sfRes = await fetch(`${apiBase}/api/v1/storefront/${res.store_slug}`, { cache: "no-store" });
  const sf = sfRes.ok ? await sfRes.json() : { store: {}, products: [] };
  const products: SelfOrderProduct[] = sf.products ?? [];
  const hue: number | undefined = sf.store?.theme_hue;

  return (
    <div style={hue != null ? themeStyleForHue(hue) : undefined}>
      <SelfOrderFlow
        slug={res.store_slug}
        storeName={res.store_name}
        tableId={res.table_id}
        tableLabel={res.table_label}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          price_cents: p.price_cents,
          stock: p.stock,
          photo_url: p.photo_urls?.[0],
          has_variants: p.has_variants,
          product_type: p.product_type,
        }))}
      />
    </div>
  );
}
