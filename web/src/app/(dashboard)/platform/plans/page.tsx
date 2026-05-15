import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminPlansEditor } from "@/components/admin/admin-plans-editor";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { PublicPlan } from "@/lib/types";

export const metadata = { title: "Harga Paket — SellOn" };

export default async function PlatformPaketPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const data = await serverApi<{ plans: PublicPlan[] }>("/api/v1/admin/plans");
  const initial = data?.plans ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Harga Paket"
      pageSubtitle="Source-of-truth untuk landing & checkout — perubahan langsung berlaku untuk pelanggan baru"
    >
      <AdminPlansEditor initial={initial} />
    </DashboardShell>
  );
}
