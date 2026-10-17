import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminPartnerDetail } from "@/components/admin/admin-partner-detail";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type {
  Partner,
  PartnerCommission,
  PartnerPayout,
  PartnerReferral,
} from "@/lib/types";

export const metadata = { title: "Detail partner" };

export default async function PlatformPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const { id } = await params;
  const data = await serverApi<{
    partner: Partner;
    referrals: PartnerReferral[];
    referrals_total: number;
    commissions: PartnerCommission[];
    commissions_total: number;
    payouts: PartnerPayout[];
  }>(`/api/v1/admin/partners/${id}`);

  if (!data?.partner) notFound();

  return (
    <DashboardShell
      me={me}
      pageTitle={data.partner.name}
      pageSubtitle={`Kode ${data.partner.code}`}
    >
      <AdminPartnerDetail
        partner={data.partner}
        referrals={data.referrals ?? []}
        referralsTotal={data.referrals_total ?? 0}
        commissions={data.commissions ?? []}
        payouts={data.payouts ?? []}
      />
    </DashboardShell>
  );
}
