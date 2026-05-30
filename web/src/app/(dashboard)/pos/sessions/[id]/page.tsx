import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Download } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { getMe, getPlan } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { SessionOrdersTable } from "@/components/pos/session-orders-table";
import type { POSSessionSummary, POSCashMovement, POSSessionOrder } from "@/lib/types";

export const metadata = { title: "Detail Shift — SellOn" };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if ((await getPlan()) !== "bisnis") return <UpgradePrompt feature="Detail Shift Kasir" />;

  const { id } = await params;
  const [summaryRes, movementsRes, ordersRes] = await Promise.all([
    serverApi<{ summary: POSSessionSummary }>(`/api/v1/pos/sessions/${id}/summary`),
    serverApi<{ movements: POSCashMovement[] }>(`/api/v1/pos/sessions/${id}/cash-movements`),
    serverApi<{ orders: POSSessionOrder[] }>(`/api/v1/pos/sessions/${id}/orders`),
  ]);

  if (!summaryRes?.summary) notFound();

  const summary = summaryRes.summary;
  const session = summary.session;
  const movements = movementsRes?.movements ?? [];
  const orders = ordersRes?.orders ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Detail Shift Kasir"
      pageSubtitle={`Dibuka ${formatDateTime(session.opened_at)} oleh ${session.opened_by_name || "—"}`}
      actions={
        orders.length > 0 ? (
          <a
            href={`${apiBase}/api/v1/pos/sessions/${id}/orders.csv`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        ) : undefined
      }
    >
      <div className="mb-4">
        <Link
          href="/pos/sessions"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Kembali ke riwayat
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales summary */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">Penjualan</h2>
            <Badge variant={session.status === "open" ? "success" : "outline"}>
              {session.status === "open" ? "Aktif" : "Selesai"}
            </Badge>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Tunai" value={summary.total_cash} />
            <Row label="QRIS" value={summary.total_qris} />
            <Row label="Transfer" value={summary.total_transfer} />
            <Row label="Midtrans" value={summary.total_midtrans} />
            <Row label="Total Penjualan" value={summary.total_sales} bold />
            <p className="text-xs text-neutral-500">{summary.order_count} transaksi</p>
          </dl>
        </div>

        {/* Cash summary */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card">
          <h2 className="font-semibold text-neutral-900">Kas</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Kas Awal" value={session.opening_cash_cents} />
            <Row label="Cash In" value={summary.total_cash_in} />
            <Row label="Cash Out" value={-summary.total_cash_out} />
            <Row label="Ekspektasi di Laci" value={summary.expected_cash} bold />
            {session.closing_cash_cents !== null && (
              <>
                <Row label="Kas Aktual" value={session.closing_cash_cents} />
                <Row
                  label="Selisih"
                  value={session.closing_cash_cents - summary.expected_cash}
                  bold
                />
              </>
            )}
          </dl>
        </div>
      </div>

      {/* Orders table */}
      {orders.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-neutral-900">
            Transaksi ({orders.length})
          </h2>
          <SessionOrdersTable
            orders={orders}
            sessionStatus={session.status}
          />
        </div>
      )}

      {/* Cash movements */}
      {movements.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <div className="border-b border-neutral-100 px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
              <Clock className="size-4" aria-hidden />
              Pergerakan Kas ({movements.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-neutral-500">Waktu</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-500">Tipe</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-500">Alasan</th>
                <th className="px-4 py-2 text-right font-medium text-neutral-500">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-neutral-500">{formatDateTime(m.created_at)}</td>
                  <td className="px-4 py-2">
                    <Badge variant={m.type === "in" ? "success" : "warning"}>
                      {m.type === "in" ? "Masuk" : "Keluar"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">{m.reason}</td>
                  <td className="px-4 py-2 text-right font-semibold text-neutral-900">
                    {m.type === "in" ? "+" : "−"}{formatRupiah(m.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div
      className={
        bold
          ? "flex justify-between border-t border-neutral-100 pt-2 text-base font-semibold text-neutral-900"
          : "flex justify-between text-neutral-600"
      }
    >
      <dt>{label}</dt>
      <dd>{formatRupiah(value)}</dd>
    </div>
  );
}
