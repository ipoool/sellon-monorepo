import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { Stat } from "@/components/ui/stat";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { getAdminStats } from "@/lib/admin-stats";
import type { AdminUser } from "@/lib/types";

export const metadata = { title: "Pengguna" };

type SearchParams = Promise<{ q?: string; plan?: string }>;

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
  // Anything else is "no filter", so a hand-edited URL cannot produce an
  // empty table with no tab highlighted.
  const plan = params.plan === "free" || params.plan === "paid" ? params.plan : "";
  const url =
    "/api/v1/admin/users?limit=50" +
    (q ? `&q=${encodeURIComponent(q)}` : "") +
    (plan ? `&plan=${plan}` : "");
  // Both in one round trip: the table is the page, the stats are context.
  const [data, stats] = await Promise.all([
    serverApi<{
      users: AdminUser[];
      counts: { all: number; free: number; paid: number };
    }>(url),
    getAdminStats(),
  ]);
  const initial = data?.users ?? [];
  const activeUsers = stats.total_users - stats.banned_users;
  // Counts ride along with the list, computed over the same population the
  // table shows (non-admin users). The "Langganan berbayar" card above
  // answers a different question — subscriptions platform-wide — so the
  // two can legitimately differ when an admin account owns a store.
  const counts = data?.counts ?? { all: 0, free: 0, paid: 0 };

  return (
    <DashboardShell
      me={me}
      pageTitle="Pengguna"
      pageSubtitle="Cari, ban, atau impersonate pengguna untuk debugging"
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total pengguna" value={stats.total_users.toLocaleString("id-ID")} />
        <Stat
          label="Daftar bulan ini"
          value={stats.users_this_month.toLocaleString("id-ID")}
        />
        <Stat
          label="Langganan berbayar"
          value={stats.paid_subs_count.toLocaleString("id-ID")}
        />
        <Stat
          label="Aktif / diblokir"
          value={`${activeUsers.toLocaleString("id-ID")} / ${stats.banned_users.toLocaleString("id-ID")}`}
        />
      </div>

      <AdminUsersTable
        initial={initial}
        initialQuery={q}
        initialPlan={plan}
        counts={counts}
      />
    </DashboardShell>
  );
}
