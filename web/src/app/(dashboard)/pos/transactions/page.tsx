import { redirect } from "next/navigation";
import Link from "next/link";
import { Printer, Calendar, Receipt, ArrowRight } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getMe, getPlan } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import type { POSSessionOrder, POSCashier } from "@/lib/types";

export const metadata = { title: "Riwayat Transaksi POS — SellOn" };

const PAGE_SIZE = 30;

function formatDateTime(iso: string) {
  // Explicit Jakarta TZ so SSR (UTC) + client render the same — avoids
  // hydration mismatch.
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function methodLabel(method: string): string {
  switch (method) {
    case "cash": return "Tunai";
    case "qris": return "QRIS";
    case "manual_transfer":
    case "bank_transfer": return "Transfer";
    case "midtrans": return "Midtrans";
    case "edc_debit": return "EDC Debit";
    case "edc_kredit": return "EDC Kredit";
    case "pos_split": return "Split";
    case "free": return "Gratis";
    default: return method || "—";
  }
}

export default async function POSTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cashier_id?: string;
    from?: string;
    to?: string;
    payment_method?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if ((await getPlan()) !== "bisnis")
    return <UpgradePrompt feature="Riwayat Transaksi POS" />;

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (sp.cashier_id) params.set("cashier_id", sp.cashier_id);
  if (sp.from) params.set("from", sp.from);
  if (sp.to) params.set("to", sp.to);
  if (sp.payment_method) params.set("payment_method", sp.payment_method);
  if (sp.status) params.set("status", sp.status);
  if (sp.q) params.set("q", sp.q);

  const [ordersRes, cashiersRes] = await Promise.all([
    serverApi<{ orders: POSSessionOrder[]; total: number }>(`/api/v1/pos/orders?${params}`),
    serverApi<{ cashiers: POSCashier[] }>("/api/v1/pos/cashiers"),
  ]);

  const orders = ordersRes?.orders ?? [];
  const total = ordersRes?.total ?? 0;
  const cashiers = cashiersRes?.cashiers ?? [];
  const hasFilters = !!(
    sp.cashier_id || sp.from || sp.to || sp.payment_method || sp.status || sp.q
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build a page href that preserves the active filters.
  const pageHref = (p: number) => {
    const u = new URLSearchParams();
    if (sp.cashier_id) u.set("cashier_id", sp.cashier_id);
    if (sp.from) u.set("from", sp.from);
    if (sp.to) u.set("to", sp.to);
    if (sp.payment_method) u.set("payment_method", sp.payment_method);
    if (sp.status) u.set("status", sp.status);
    if (sp.q) u.set("q", sp.q);
    if (p > 1) u.set("page", String(p));
    const qs = u.toString();
    return qs ? `/pos/transactions?${qs}` : "/pos/transactions";
  };

  return (
    <DashboardShell
      me={me}
      pageTitle="Riwayat Transaksi"
      pageSubtitle={`${total} transaksi POS`}
    >
      {/* Filters */}
      <form
        method="GET"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Cari</label>
          <Input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="No. order / pelanggan"
            className="h-9 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Kasir</label>
          <Select name="cashier_id" defaultValue={sp.cashier_id ?? ""} className="h-9 w-40">
            <option value="">Semua kasir</option>
            {cashiers.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Metode</label>
          <Select name="payment_method" defaultValue={sp.payment_method ?? ""} className="h-9 w-36">
            <option value="">Semua</option>
            <option value="cash">Tunai</option>
            <option value="qris">QRIS</option>
            <option value="manual_transfer">Transfer</option>
            <option value="edc_debit">EDC Debit</option>
            <option value="edc_kredit">EDC Kredit</option>
            <option value="pos_split">Split</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Status</label>
          <Select name="status" defaultValue={sp.status ?? ""} className="h-9 w-32">
            <option value="">Semua</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Dari</label>
          <Input type="date" name="from" defaultValue={sp.from ?? ""} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Sampai</label>
          <Input type="date" name="to" defaultValue={sp.to ?? ""} className="h-9 w-40" />
        </div>
        <Button type="submit" size="sm">
          <Calendar className="size-4" aria-hidden />
          Filter
        </Button>
        {hasFilters && (
          <Link
            href="/pos/transactions"
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
          >
            Reset
          </Link>
        )}
      </form>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <Receipt className="size-8 text-neutral-400" aria-hidden />
          <p className="font-semibold text-neutral-900">
            {hasFilters ? "Tidak ada transaksi cocok dengan filter" : "Belum ada transaksi POS"}
          </p>
          <p className="text-sm text-neutral-500">
            {hasFilters
              ? "Coba ubah filter atau reset."
              : "Transaksi dari kasir akan muncul di sini."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Waktu</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">No. Order</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Kasir</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Pelanggan</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Item</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Bayar</th>
                  <th className="px-4 py-2 text-right font-medium text-neutral-500">Total</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Status</th>
                  <th className="px-4 py-2 text-right font-medium text-neutral-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {orders.map((o) => {
                  const isCancelled = o.status === "cancelled";
                  return (
                    <tr key={o.order_id} className={isCancelled ? "opacity-60" : "hover:bg-neutral-50"}>
                      <td className="whitespace-nowrap px-4 py-2 text-neutral-500">
                        {formatDateTime(o.created_at)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-neutral-700">
                        #{o.order_number}
                      </td>
                      <td className="px-4 py-2 text-neutral-700">{o.cashier_name || "—"}</td>
                      <td className="px-4 py-2 text-neutral-700">{o.customer_name || "—"}</td>
                      <td className="px-4 py-2 text-neutral-500">{o.item_count} item</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="font-normal">
                          {methodLabel(o.payment_method)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-neutral-900">
                        {formatRupiah(o.total_cents)}
                      </td>
                      <td className="px-4 py-2">
                        {isCancelled ? (
                          <Badge variant="danger">{o.refunded_at ? "Diretur" : "Dibatalkan"}</Badge>
                        ) : (
                          <Badge variant="success">Selesai</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/pos/orders/${o.order_id}/receipt?autoprint=1`}
                            target="_blank"
                            title="Cetak ulang struk"
                            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-brand-700"
                          >
                            <Printer className="size-3.5" aria-hidden />
                          </Link>
                          <Link
                            href={`/orders/${o.order_id}`}
                            title="Lihat detail"
                            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                          >
                            <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-neutral-500">
                Halaman {page} dari {totalPages}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Sebelumnya
                  </Link>
                ) : (
                  <span className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-300">
                    Sebelumnya
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Berikutnya
                  </Link>
                ) : (
                  <span className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-300">
                    Berikutnya
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
