import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminAddonsEditor } from "@/components/admin/admin-addons-editor";
import { AdminPlansEditor } from "@/components/admin/admin-plans-editor";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { AdminAddon, PublicPlan } from "@/lib/types";

export const metadata = { title: "Harga Paket" };

export default async function PlatformPaketPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const [data, addonsRes] = await Promise.all([
    serverApi<{ plans: PublicPlan[] }>("/api/v1/admin/plans"),
    serverApi<{ addons: AdminAddon[] }>("/api/v1/admin/addons"),
  ]);
  const initial = data?.plans ?? [];
  const addons = addonsRes?.addons ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Harga Paket"
      pageSubtitle="Source-of-truth untuk landing & checkout — perubahan langsung berlaku untuk pelanggan baru"
    >
      <AdminPlansEditor initial={initial} />
      {/* Add-on pricing sits under the tiers: it is the same decision,
          and seeing both together is how you keep three packages from
          quietly costing more than the bundle. */}
      <AdminAddonsEditor initial={addons} />
    </DashboardShell>
  );
}
