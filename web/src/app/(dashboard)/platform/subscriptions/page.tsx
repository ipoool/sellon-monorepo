import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminSubscriptionsTable } from "@/components/admin/admin-subscriptions-table";
import { Stat } from "@/components/ui/stat";
import { formatRupiah } from "@/lib/format";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { AdminSubscriptionInvoice } from "@/lib/types";

export const metadata = { title: "Transaksi" };

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
    summary: {
      gross_cents: number;
      this_month_cents: number;
      paid_count: number;
      pending_count: number;
    };
  }>(`/api/v1/admin/subscriptions/invoices?${params.toString()}`);
  const invoices = data?.invoices ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary ?? {
    gross_cents: 0,
    this_month_cents: 0,
    paid_count: 0,
    pending_count: 0,
  };
  const filtered = Boolean(q || status);

  return (
    <DashboardShell
      me={me}
      pageTitle="Transaksi"
      pageSubtitle={`${total} transaksi tercatat${
        status ? ` (status: ${status})` : ""
      }`}
    >
      {/* Revenue counts PAID invoices only — a pending one is a request,
          not money — and follows whatever filter is applied, so the numbers
          always describe the rows below them. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={filtered ? "Pendapatan (terfilter)" : "Total pendapatan"}
          value={formatRupiah(summary.gross_cents)}
        />
        <Stat
          label="Pendapatan bulan ini"
          value={formatRupiah(summary.this_month_cents)}
        />
        <Stat
          label="Transaksi lunas"
          value={summary.paid_count.toLocaleString("id-ID")}
        />
        <Stat
          label="Menunggu aktivasi"
          value={summary.pending_count.toLocaleString("id-ID")}
        />
      </div>

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
