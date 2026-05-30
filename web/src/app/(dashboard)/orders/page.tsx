import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox, Send, Download } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { QuotaBanner } from "@/components/dashboard/quota-banner";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Order, Subscription } from "@/lib/types";

export const metadata = { title: "Pesanan — SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const PAGE_SIZE = 25;

// Status tabs — one click triage instead of a dropdown. Each tab maps to a
// group of order statuses sent to the API as a comma-separated `status` param.
const TABS = [
  {
    key: "perlu",
    label: "Perlu Diproses",
    statuses: ["pending", "confirmed", "processing"],
  },
  { key: "dikirim", label: "Dikirim", statuses: ["shipped"] },
  { key: "selesai", label: "Selesai", statuses: ["completed"] },
  { key: "dibatalkan", label: "Dibatalkan", statuses: ["cancelled"] },
] as const;

const DEFAULT_TAB = TABS[0];

export default async function PesananPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tab?: string;
    payment_status?: string;
    page?: string;
  }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const sp = await searchParams;
  const q = sp.q ?? "";
  const paymentStatus = sp.payment_status ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const activeTab = TABS.find((t) => t.key === sp.tab) ?? DEFAULT_TAB;

  // Shared query string for export + tab links: search + payment filter
  // (the status group comes from the active tab).
  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (paymentStatus) baseParams.set("payment_status", paymentStatus);

  // Filters-only QS for the export link (server export ignores paging),
  // including the active tab's status group.
  const exportParams = new URLSearchParams(baseParams);
  exportParams.set("status", activeTab.statuses.join(","));
  const exportHref = `${apiBase}/api/v1/orders/export?${exportParams.toString()}`;

  const apiParams = new URLSearchParams(baseParams);
  apiParams.set("status", activeTab.statuses.join(","));
  apiParams.set("limit", String(PAGE_SIZE));
  apiParams.set("offset", String((page - 1) * PAGE_SIZE));

  const [data, subRes] = await Promise.all([
    serverApi<{
      orders: Order[];
      total: number;
      status_counts?: Record<string, number>;
    }>(`/api/v1/orders?${apiParams.toString()}`),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);
  const orders = data?.orders ?? [];
  const total = data?.total ?? orders.length;
  const counts = data?.status_counts ?? {};
  const isFiltered = Boolean(q || paymentStatus);
  const sub = subRes?.subscription;
  const orderQuota = sub?.quotas?.orders;
  const isOrderCapped = !!orderQuota && orderQuota.limit > 0;
  const tierLabel =
    sub?.plan === "pro" ? "Pro" : sub?.plan === "bisnis" ? "Bisnis" : "Gratis";

  // Count per tab = sum of its statuses' store-wide counts.
  const tabCount = (statuses: readonly string[]) =>
    statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  // Build a tab link that preserves the search + payment filter (drops page).
  const tabHref = (key: string) => {
    const p = new URLSearchParams(baseParams);
    p.set("tab", key);
    return `/orders?${p.toString()}`;
  };

  return (
    <DashboardShell
      me={me}
      pageTitle="Pesanan"
      pageSubtitle={`${total} pesanan · ${activeTab.label}${isFiltered ? " (terfilter)" : ""}`}
      actions={
        <a href={exportHref} download target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">
            <Download className="size-4" aria-hidden />
            Export CSV
          </Button>
        </a>
      }
    >
      {/* Free-tier order quota indicator */}
      {isOrderCapped && orderQuota && (
        <QuotaBanner
          label="Pesanan bulan ini"
          tierName={tierLabel}
          used={orderQuota.used}
          limit={orderQuota.limit}
          fullMessage="Limit pesanan tercapai. Toko publikmu sementara menolak order baru sampai bulan berikutnya atau upgrade."
        />
      )}

      {/* Status tabs */}
      <div className="mb-4 -mx-1 overflow-x-auto px-1">
        <div
          role="tablist"
          aria-label="Filter status pesanan"
          className="inline-flex min-w-full gap-1 rounded-xl bg-neutral-100 p-1"
        >
          {TABS.map((t) => {
            const isActive = t.key === activeTab.key;
            const n = tabCount(t.statuses);
            return (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                role="tab"
                aria-selected={isActive}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {t.label}
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                    isActive
                      ? "bg-brand-100 text-brand-700"
                      : "bg-neutral-200 text-neutral-500"
                  }`}
                >
                  {n}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Search + payment filter (status comes from the tabs above) */}
      <form
        method="GET"
        className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="tab" value={activeTab.key} />
        <div className="flex-1">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Cari nomor order atau nama pembeli…"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
          <div className="sm:w-44">
            <Select name="payment_status" defaultValue={paymentStatus}>
              <option value="">Semua pembayaran</option>
              <option value="unpaid">Belum bayar</option>
              <option value="pending">Bukti dikirim</option>
              <option value="paid">Lunas</option>
              <option value="failed">Gagal</option>
              <option value="refunded">Refund</option>
            </Select>
          </div>
          <Button type="submit" size="md" variant="outline">
            Filter
          </Button>
          {isFiltered && (
            <Link href={tabHref(activeTab.key)}>
              <Button type="button" size="md" variant="ghost">
                Reset
              </Button>
            </Link>
          )}
        </div>
      </form>

      {orders.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Inbox className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            {isFiltered
              ? "Tidak ada pesanan yang cocok"
              : `Tidak ada pesanan di "${activeTab.label}"`}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            {isFiltered
              ? "Coba ubah kata kunci atau reset filter."
              : "Pesanan akan muncul di tab ini sesuai statusnya. Cek tab lain atau bagikan link katalog ke pelangganmu."}
          </p>
          {!isFiltered && (
            <div className="mt-6">
              <Button>
                <Send className="size-4" aria-hidden />
                Bagikan Katalog
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <OrdersTable orders={orders} page={page} total={total} />
      )}
    </DashboardShell>
  );
}
