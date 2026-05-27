import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Package, Zap } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { JoinResellerDialog } from "@/components/dashboard/join-reseller-dialog";
import type { ResellerMembership, Subscription } from "@/lib/types";

export const metadata = { title: "Supplier Saya — SellOn" };

export default async function MySuppliersPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const [res, subRes] = await Promise.all([
    serverApi<{ memberships: ResellerMembership[] }>("/api/v1/reseller/memberships"),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);

  const memberships = res?.memberships ?? [];
  const plan = subRes?.subscription?.plan ?? "free";
  const isFree = plan === "free";

  return (
    <DashboardShell
      me={me}
      pageTitle="Supplier Saya"
      pageSubtitle={`${memberships.length} program reseller bergabung`}
      actions={<JoinResellerDialog disabled={isFree} />}
    >
      {isFree ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Zap className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Fitur untuk plan Pro & Bisnis</p>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Bergabung ke program reseller supplier dan jual produk mereka di toko kamu tanpa modal stok.
              Upgrade untuk mengaktifkan fitur ini.
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <Zap className="size-4" aria-hidden />
            Upgrade ke Pro
          </Link>
        </div>
      ) : memberships.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Users className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Belum bergabung ke program manapun</p>
            <p className="mt-1 text-sm text-neutral-500">
              Minta kode undangan dari supplier, lalu masukkan untuk mulai jual produk mereka.
            </p>
          </div>
          <JoinResellerDialog />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-neutral-900">{m.supplier_store_name}</p>
                  <p className="mt-0.5 text-sm text-neutral-500">{m.program_name}</p>
                </div>
                <Badge variant={m.is_active ? "success" : "outline"} className="shrink-0">
                  {m.is_active ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                <Package className="size-3.5 text-neutral-400" aria-hidden />
                {m.product_count} produk tersedia
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/reseller/catalog?membership=${m.id}`}
                  className="flex-1 rounded-lg border border-neutral-200 py-2 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Lihat Produk
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
