import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminSubscriptionsTable } from "@/components/admin/admin-subscriptions-table";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { AdminSubscriptionInvoice } from "@/lib/types";

export const metadata = { title: "Transaksi — SellOn" };

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  q?: string;
  status?: string;
  page?: string;
}>;

export default async function PlatformSubscriptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((page - 1) * PAGE_SIZE));

  const data = await serverApi<{
    invoices: AdminSubscriptionInvoice[];
    total: number;
  }>(`/api/v1/admin/subscriptions/invoices?${params.toString()}`);
  const invoices = data?.invoices ?? [];
  const total = data?.total ?? 0;

  return (
    <DashboardShell
      me={me}
      pageTitle="Transaksi"
      pageSubtitle={`${total} transaksi tercatat${
        status ? ` (status: ${status})` : ""
      }`}
    >
      <AdminSubscriptionsTable
        initial={invoices}
        total={total}
        page={page}
        initialQuery={q}
        initialStatus={status}
      />
    </DashboardShell>
  );
}
