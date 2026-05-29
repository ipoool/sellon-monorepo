import { redirect } from "next/navigation";
import { BarChart3, Calendar, Download } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type { POSReport, POSCashier } from "@/lib/types";

export const metadata = { title: "Laporan POS — SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

export default async function POSReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cashier_id?: string; from?: string; to?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const from = sp.from || thirtyDaysAgoStr();
  const to = sp.to || todayStr();

  const reportParams = new URLSearchParams({ from, to });
  if (sp.cashier_id) reportParams.set("cashier_id", sp.cashier_id);

  const [reportRes, cashiersRes] = await Promise.all([
    serverApi<{ report: POSReport }>(`/api/v1/pos/reports?${reportParams}`),
    serverApi<{ cashiers: POSCashier[] }>("/api/v1/pos/cashiers"),
  ]);

  const report = reportRes?.report;
  const cashiers = cashiersRes?.cashiers ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Laporan POS"
      pageSubtitle={`Dari ${from} sampai ${to}`}
      actions={
        report && report.order_count > 0 ? (
          <a
            href={`${apiBase}/api/v1/pos/reports.csv?${reportParams}`}
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
      {/* Filters */}
      <form
        method="GET"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
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
          <label className="text-xs font-medium text-neutral-500">Dari tanggal</label>
          <Input type="date" name="from" defaultValue={from} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Sampai</label>
          <Input type="date" name="to" defaultValue={to} className="h-9 w-40" />
        </div>
        <Button type="submit" size="sm">
          <Calendar className="size-4" aria-hidden />
          Terapkan
        </Button>
      </form>

      {!report || report.order_count === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <BarChart3 className="size-8 text-neutral-400" aria-hidden />
          <p className="font-semibold text-neutral-900">Belum ada transaksi POS di periode ini</p>
          <p className="text-sm text-neutral-500">Ubah filter tanggal atau pilih kasir lain.</p>
        </div>
      ) : (
        <>
          {/* Headline metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Transaksi" value={report.order_count.toLocaleString("id-ID")} />
            <Stat label="Total Penjualan" value={formatRupiah(report.total_gross)} />
            <Stat label="Avg per Transaksi" value={formatRupiah(report.avg_transaction)} />
            <Stat label="Diretur" value={formatRupiah(report.total_refunded)} />
          </div>

          {/* Payment breakdown */}
          <Card className="mt-6">
            <h2 className="mb-4 font-semibold text-neutral-900">Breakdown Metode Pembayaran</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PaymentMethodCard label="Tunai" value={report.total_cash} total={report.total_gross} />
              <PaymentMethodCard label="QRIS" value={report.total_qris} total={report.total_gross} />
              <PaymentMethodCard label="Transfer" value={report.total_transfer} total={report.total_gross} />
              <PaymentMethodCard label="Midtrans" value={report.total_midtrans} total={report.total_gross} />
            </div>
          </Card>

          {/* Per cashier */}
          {report.by_cashier.length > 0 && (
            <Card className="mt-6">
              <h2 className="mb-4 font-semibold text-neutral-900">Penjualan per Kasir</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-neutral-500">Kasir</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Transaksi</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Total Penjualan</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Kontribusi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {report.by_cashier.map((c) => {
                      const pct =
                        report.total_gross > 0
                          ? Math.round((c.total_cents / report.total_gross) * 100)
                          : 0;
                      return (
                        <tr key={c.cashier_id}>
                          <td className="px-3 py-2 font-medium text-neutral-900">{c.cashier_name}</td>
                          <td className="px-3 py-2 text-right text-neutral-600">{c.order_count}</td>
                          <td className="px-3 py-2 text-right font-semibold text-neutral-900">
                            {formatRupiah(c.total_cents)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-500">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Top products */}
          {report.top_products.length > 0 && (
            <Card className="mt-6">
              <h2 className="mb-4 font-semibold text-neutral-900">Top Produk POS</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-neutral-500">Produk</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Qty Terjual</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {report.top_products.map((p) => (
                      <tr key={p.product_id} className="hover:bg-neutral-50">
                        <td className="px-3 py-2 font-medium text-neutral-900">{p.product_name}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">{p.quantity}</td>
                        <td className="px-3 py-2 text-right font-semibold text-neutral-900">
                          {formatRupiah(p.total_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Daily series */}
          {report.daily_series.length > 0 && (
            <Card className="mt-6">
              <h2 className="mb-4 font-semibold text-neutral-900">Penjualan Harian</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-neutral-500">Tanggal</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Transaksi</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Penjualan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {report.daily_series.map((d) => (
                      <tr key={d.date}>
                        <td className="px-3 py-2 text-neutral-700">{d.date}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">{d.order_count}</td>
                        <td className="px-3 py-2 text-right font-semibold text-neutral-900">
                          {formatRupiah(d.total_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </DashboardShell>
  );
}

function PaymentMethodCard({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-neutral-900">{formatRupiah(value)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-neutral-500">{pct}% dari total</p>
    </div>
  );
}
