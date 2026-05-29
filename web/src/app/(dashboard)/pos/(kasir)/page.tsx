import { redirect } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";

import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { POSApp } from "@/components/pos/pos-app";
import type { Product, Category, Subscription, POSSession } from "@/lib/types";

export const metadata = { title: "Kasir POS — SellOn" };

export default async function POSPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const [productsRes, categoriesRes, subRes, sessionRes] = await Promise.all([
    serverApi<{ products: Product[]; total: number }>("/api/v1/products?limit=200&status=active"),
    serverApi<{ categories: Category[] }>("/api/v1/categories"),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
    serverApi<{ session: POSSession | null }>("/api/v1/pos/sessions/active"),
  ]);

  const plan = subRes?.subscription?.plan ?? "free";

  if (plan === "free") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Zap className="size-7" aria-hidden />
        </div>
        <div className="max-w-md">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">
            Kasir POS hanya untuk plan Pro & Bisnis
          </h1>
          <p className="mt-2 text-neutral-600">
            Modul kasir untuk toko fisik: terima walk-in customer, kelola shift, cetak struk thermal,
            split payment, dan banyak lagi. Upgrade sekarang.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <Zap className="size-4" aria-hidden />
            Upgrade ke Pro
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Kembali ke Dasbor
          </Link>
        </div>
      </div>
    );
  }

  return (
    <POSApp
      me={me}
      products={productsRes?.products ?? []}
      categories={categoriesRes?.categories ?? []}
      initialSession={sessionRes?.session ?? null}
    />
  );
}
