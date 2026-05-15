import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { AdminUser } from "@/lib/types";

export const metadata = { title: "Pengguna — SellOn" };

type SearchParams = Promise<{ q?: string }>;

export default async function PlatformPenggunaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const params = await searchParams;
  const q = params.q ?? "";
  const url =
    "/api/v1/admin/users?limit=50" +
    (q ? `&q=${encodeURIComponent(q)}` : "");
  const data = await serverApi<{ users: AdminUser[] }>(url);
  const initial = data?.users ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Pengguna"
      pageSubtitle="Cari, ban, atau impersonate pengguna untuk debugging"
    >
      <AdminUsersTable initial={initial} initialQuery={q} />
    </DashboardShell>
  );
}
