import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminBannersManager } from "@/components/admin/admin-banners-manager";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { PlatformBanner } from "@/lib/types";

export const metadata = { title: "Banner — SellOn" };

export default async function PlatformBannersPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const data = await serverApi<{ banners: PlatformBanner[] }>("/api/v1/admin/banners");

  return (
    <DashboardShell
      me={me}
      pageTitle="Banner Dashboard"
      pageSubtitle="Banner promo/informasi dari SellOn — tampil sebagai slider di dashboard semua seller"
    >
      <AdminBannersManager initial={data?.banners ?? []} />
    </DashboardShell>
  );
}
