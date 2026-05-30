import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Clock, Calendar } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { OpenShiftLauncher } from "@/components/pos/open-shift-launcher";
import { getMe, getPlan } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import type { POSSession, POSCashier } from "@/lib/types";

export const metadata = { title: "Riwayat Shift Kasir — SellOn" };

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

export default async function POSSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cashier_id?: string;
    from?: string;
    to?: string;
    status?: string;
  }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if ((await getPlan()) !== "bisnis") return <UpgradePrompt feature="Riwayat Shift Kasir" />;

  const sp = await searchParams;
  const params = new URLSearchParams();
  params.set("limit", "100");
  if (sp.cashier_id) params.set("cashier_id", sp.cashier_id);
  if (sp.from) params.set("from", sp.from);
  if (sp.to) params.set("to", sp.to);
  if (sp.status) params.set("status", sp.status);

  const [sessionsRes, cashiersRes] = await Promise.all([
    serverApi<{ sessions: POSSession[]; total: number }>(`/api/v1/pos/sessions?${params}`),
    serverApi<{ cashiers: POSCashier[] }>("/api/v1/pos/cashiers"),
  ]);

  const sessions = sessionsRes?.sessions ?? [];
  const cashiers = cashiersRes?.cashiers ?? [];
  const hasFilters = !!(sp.cashier_id || sp.from || sp.to || sp.status);

  return (
    <DashboardShell
      me={me}
      pageTitle="Riwayat Shift Kasir"
      pageSubtitle={`${sessionsRes?.total ?? 0} shift terdata`}
      actions={<OpenShiftLauncher />}
    >
      {/* Filters */}
      <form
        method="GET"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Kasir</label>
          <Select name="cashier_id" defaultValue={sp.cashier_id ?? ""} className="h-9 w-44">
            <option value="">Semua kasir</option>
            {cashiers.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Status</label>
          <Select name="status" defaultValue={sp.status ?? ""} className="h-9 w-32">
            <option value="">Semua</option>
            <option value="open">Aktif</option>
            <option value="closed">Selesai</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Dari tanggal</label>
          <Input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="h-9 w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Sampai</label>
          <Input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="h-9 w-40"
          />
        </div>
        <Button type="submit" size="sm">
          <Calendar className="size-4" aria-hidden />
          Filter
        </Button>
        {hasFilters && (
          <Link
            href="/pos/sessions"
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
          >
            Reset
          </Link>
        )}
      </form>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <Clock className="size-8 text-neutral-400" aria-hidden />
          <p className="font-semibold text-neutral-900">
            {hasFilters ? "Tidak ada shift cocok dengan filter" : "Belum ada shift"}
          </p>
          <p className="text-sm text-neutral-500">
            {hasFilters ? "Coba ubah filter atau reset." : "Buka kasir untuk memulai shift pertama."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Kasir</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Dibuka</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Ditutup</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-500">Kas Awal</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-500">Kas Akhir</th>
                <th className="w-8 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">{s.opened_by_name || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={s.status === "open" ? "success" : "outline"}>
                      {s.status === "open" ? "Aktif" : "Selesai"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{formatDateTime(s.opened_at)}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {s.closed_at ? formatDateTime(s.closed_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-600">
                    {formatRupiah(s.opening_cash_cents)}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-900">
                    {s.closing_cash_cents !== null ? formatRupiah(s.closing_cash_cents) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/pos/sessions/${s.id}`}
                      className="text-brand-700 hover:text-brand-800"
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
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
