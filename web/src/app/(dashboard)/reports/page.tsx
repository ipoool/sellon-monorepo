import { redirect } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingBag,
  Wallet,
  CheckCircle2,
  BarChart3,
  Download,
} from "lucide-react";

import { AiInsightButton } from "@/components/dashboard/ai-insight-button";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { LockedChartOverlay } from "@/components/dashboard/locked-chart-overlay";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Subscription } from "@/lib/types";

export const metadata = { title: "Laporan — SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const views = [
  { key: "daily", label: "Harian" },
  { key: "weekly", label: "Mingguan" },
  { key: "monthly", label: "Bulanan" },
] as const;

type View = "daily" | "weekly" | "monthly";

const chartTitle: Record<View, string> = {
  daily:   "Revenue Harian",
  weekly:  "Revenue Mingguan",
  monthly: "Revenue Bulanan",
};

const statusLabel: Record<string, string> = {
  pending: "Menunggu",
  confirmed: "Dikonfirmasi",
  processing: "Diproses",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

type ReportData = {
  has_store: boolean;
  days: number;
  headline: {
    orders_total: number;
    orders_cancelled: number;
    revenue_cents: number;
    paid_orders: number;
    aov_cents: number;
  };
  sales_by_day: {
    date: string;
    label: string;
    orders: number;
    revenue_cents: number;
  }[];
  top_products: {
    product_id: string;
    product_name: string;
    qty_sold: number;
    revenue_cents: number;
  }[];
  top_customers: {
    customer_id: string;
    name: string;
    whatsapp_number: string;
    orders: number;
    total_spent_cents: number;
  }[];
  status_breakdown: Record<string, number>;
  payment_breakdown: Record<string, number>;
};

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const view: View = (["daily", "weekly", "monthly"].includes(sp.view ?? "")
    ? sp.view
    : "daily") as View;

  const [data, subRes] = await Promise.all([
    serverApi<ReportData>(`/api/v1/reports/overview?view=${view}`),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);
  const hasStore = data?.has_store ?? false;
  const plan = subRes?.subscription?.plan ?? "free";
  const chartLocked = plan !== "pro" && plan !== "bisnis";

  return (
    <DashboardShell
      me={me}
      pageTitle="Laporan"
      pageSubtitle="Ringkasan penjualan & insight pelanggan"
      actions={
        <div className="flex items-center gap-3">
          <a
            href={`${apiBase}/api/v1/reports/export?view=${view}`}
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline">
              <Download className="size-4" aria-hidden />
              <span className="hidden sm:inline">Download Laporan</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </a>
          <nav className="flex gap-1.5">
          {views.map((v) => (
            <Link
              key={v.key}
              href={`/reports?view=${v.key}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                v.key === view
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {v.label}
            </Link>
          ))}
          </nav>
        </div>
      }
    >
      {!hasStore || !data ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <BarChart3 className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada data laporan
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Laporan akan tampil setelah toko aktif menerima order.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Headline stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Revenue"
              value={formatRupiah(data.headline.revenue_cents)}
            />
            <Stat
              label="Order Berbayar"
              value={String(data.headline.paid_orders)}
            />
            <Stat
              label="Total Order"
              value={String(data.headline.orders_total)}
            />
            <Stat
              label="Avg. Order Value"
              value={formatRupiah(data.headline.aov_cents)}
            />
          </div>

          {/* Sales chart — Pro/Bisnis only. Free tier sees a blurred
              preview with upgrade CTA (conversion lever). */}
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-neutral-500" aria-hidden />
                <h2 className="font-semibold text-neutral-900">
                  {chartTitle[view]}
                </h2>
              </div>
              <AiInsightButton isPaid={!chartLocked} />
            </div>
            {chartLocked ? (
              <LockedChartOverlay
                title="Chart tersedia di Pro"
                description="Lihat tren revenue harian dan ekspor laporan lengkap. Upgrade untuk membuka analytics."
              >
                <SalesChart data={data.sales_by_day} />
              </LockedChartOverlay>
            ) : (
              <SalesChart data={data.sales_by_day} />
            )}
          </Card>

          {/* Two-column: top products + top customers */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <ShoppingBag className="size-4 text-neutral-500" aria-hidden />
                <h2 className="font-semibold text-neutral-900">
                  Produk Terlaris
                </h2>
              </div>
              {data.top_products.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
                  Belum ada penjualan.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200 overflow-hidden">
                  {data.top_products.map((p, i) => (
                    <li
                      key={p.product_id || p.product_name}
                      className="flex min-w-0 items-start gap-3 py-3"
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-neutral-900">
                          {p.product_name}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-neutral-900">
                          {formatRupiah(p.revenue_cents)}
                          <span className="ml-1 font-normal text-neutral-500">
                            · {p.qty_sold} terjual
                          </span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Wallet className="size-4 text-neutral-500" aria-hidden />
                <h2 className="font-semibold text-neutral-900">
                  Pelanggan Top
                </h2>
              </div>
              {data.top_customers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
                  Belum ada pelanggan.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200 overflow-hidden">
                  {data.top_customers.map((c) => (
                    <li key={c.customer_id} className="min-w-0 py-3">
                      <Link
                        href={`/customers/${c.customer_id}`}
                        className="flex min-w-0 items-center gap-3 hover:text-brand-700"
                      >
                        <Avatar name={c.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-medium text-neutral-900">
                            {c.name}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-neutral-900">
                            {formatRupiah(c.total_spent_cents)}
                            <span className="ml-1 font-normal text-neutral-500">
                              · {c.orders} order
                            </span>
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Breakdowns */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="size-4 text-neutral-500" aria-hidden />
                <h2 className="font-semibold text-neutral-900">Status Pesanan</h2>
              </div>
              {Object.keys(data.status_breakdown).length === 0 ? (
                <p className="text-sm text-neutral-500">Belum ada data.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {Object.entries(data.status_breakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <li key={status}>
                        <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm">
                          <span className="font-display text-sm font-bold tabular-nums text-neutral-900">{count}</span>
                          <span className="text-neutral-500">{statusLabel[status] || status}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Wallet className="size-4 text-neutral-500" aria-hidden />
                <h2 className="font-semibold text-neutral-900">Metode Pembayaran</h2>
              </div>
              {Object.keys(data.payment_breakdown).length === 0 ? (
                <p className="text-sm text-neutral-500">Belum ada data.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {Object.entries(data.payment_breakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, count]) => (
                      <li key={method}>
                        <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm">
                          <span className="font-display text-sm font-bold tabular-nums text-neutral-900">{count}</span>
                          <span className="text-neutral-500">{method || "—"}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
