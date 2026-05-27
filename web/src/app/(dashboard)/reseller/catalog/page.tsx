import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, Plus, Zap } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { ResellerCatalogView } from "@/components/dashboard/reseller-catalog-view";
import { JoinResellerDialog } from "@/components/dashboard/join-reseller-dialog";
import type { ResellerCatalogEntry, ResellerMembership, Subscription } from "@/lib/types";

export const metadata = { title: "Katalog Reseller — SellOn" };

export default async function ResellerCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ membership?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const sp = await searchParams;

  const [catalogRes, membershipsRes, subRes] = await Promise.all([
    serverApi<{ catalog: ResellerCatalogEntry[] }>("/api/v1/reseller/catalog"),
    serverApi<{ memberships: ResellerMembership[] }>("/api/v1/reseller/memberships"),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);

  const catalog = catalogRes?.catalog ?? [];
  const memberships = membershipsRes?.memberships ?? [];
  const plan = subRes?.subscription?.plan ?? "free";
  const isFree = plan === "free";

  // If a membership filter is active, also fetch available products for that membership.
  let availableProducts = null;
  if (sp.membership) {
    availableProducts = await serverApi<{ products: import("@/lib/types").ProgramProduct[] }>(
      `/api/v1/reseller/memberships/${sp.membership}/products`,
    );
  }

  return (
    <DashboardShell
      me={me}
      pageTitle="Katalog Reseller"
      pageSubtitle={`${catalog.length} produk sudah diimport`}
      actions={
        !isFree && memberships.length > 0 ? (
          <Link href="/reseller/suppliers">
            <Button size="sm" variant="outline">
              <Plus className="size-4" aria-hidden />
              Import Produk Baru
            </Button>
          </Link>
        ) : undefined
      }
    >
      {isFree ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Zap className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Fitur untuk plan Pro & Bisnis</p>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Import produk dari supplier dan jual di toko kamu tanpa perlu stok sendiri.
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
            <Package className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Belum ada supplier yang bergabung</p>
            <p className="mt-1 text-sm text-neutral-500">
              Gabung dulu ke program reseller supplier untuk bisa import produk mereka.
            </p>
          </div>
          <JoinResellerDialog />
        </div>
      ) : (
        <ResellerCatalogView
          catalog={catalog}
          memberships={memberships}
          activeMembershipID={sp.membership}
          availableProducts={availableProducts?.products ?? []}
        />
      )}
    </DashboardShell>
  );
}
