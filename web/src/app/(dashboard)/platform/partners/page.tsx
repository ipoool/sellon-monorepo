import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminPartnersManager } from "@/components/admin/admin-partners-manager";
import { Stat } from "@/components/ui/stat";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type { Partner, PartnerTotals } from "@/lib/types";

export const metadata = { title: "Partner" };

export default async function PlatformPartnersPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const data = await serverApi<{ partners: Partner[]; totals: PartnerTotals }>(
    "/api/v1/admin/partners",
  );

  const partners = data?.partners ?? [];
  const totals = data?.totals ?? {
    partners: 0,
    referrals: 0,
    converted: 0,
    owed_cents: 0,
    paid_cents: 0,
  };

  return (
    <DashboardShell
      me={me}
      pageTitle="Partner"
      pageSubtitle="Siapa yang membawa pengguna, dan berapa bagi hasilnya"
    >
      {/* "Komisi belum dibayar" leads because it is the only figure here
          that asks you to do something. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Komisi belum dibayar"
          value={formatRupiah(totals.owed_cents)}
        />
        <Stat
          label="Total sudah dibayar"
          value={formatRupiah(totals.paid_cents)}
        />
        <Stat
          label="Pendaftar"
          value={totals.referrals.toLocaleString("id-ID")}
        />
        <Stat
          label="Berlangganan"
          value={totals.converted.toLocaleString("id-ID")}
        />
      </div>

      <AdminPartnersManager partners={partners} />
    </DashboardShell>
  );
}
