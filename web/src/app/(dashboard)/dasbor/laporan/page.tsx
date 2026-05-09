import { redirect } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingBag,
  Wallet,
  CheckCircle2,
  BarChart3,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Laporan — SellOn" };

const periods = [
  { days: 7, label: "7 hari" },
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
];

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
  searchParams: Promise<{ days?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/masuk");

  const sp = await searchParams;
  const requestedDays = parseInt(sp.days || "30", 10);
  const days = periods.some((p) => p.days === requestedDays)
    ? requestedDays
    : 30;

  const data = await serverApi<ReportData>(
    `/api/v1/reports/overview?days=${days}`,
  );
  const hasStore = data?.has_store ?? false;

  return (
    <DashboardShell
      me={me}
      pageTitle="Laporan"
      pageSubtitle="Ringkasan penjualan & insight pelanggan"
      actions={
        <nav className="flex gap-1.5">
          {periods.map((p) => (
            <Link
              key={p.days}
              href={`/dasbor/laporan?days=${p.days}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                p.days === days
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
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

          {/* Sales chart */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="size-4 text-neutral-500" aria-hidden />
              <h2 className="font-semibold text-neutral-900">
                Revenue Harian
              </h2>
            </div>
            <SalesChart data={data.sales_by_day} />
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
                <ul className="divide-y divide-neutral-200">
                  {data.top_products.map((p, i) => (
                    <li
                      key={`${p.product_id || p.product_name}-${i}`}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
                          {i + 1}
                        </span>
                        <p className="truncate font-medium text-neutral-900">
                          {p.product_name}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-display text-sm font-semibold text-neutral-900">
                          {formatRupiah(p.revenue_cents)}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {p.qty_sold} terjual
                        </span>
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
                <ul className="divide-y divide-neutral-200">
                  {data.top_customers.map((c) => (
                    <li
                      key={c.customer_id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <Link
                        href={`/dasbor/pelanggan/${c.customer_id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand-700"
                      >
                        <Avatar name={c.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900">
                            {c.name}
                          </p>
                          <p className="font-mono text-xs text-neutral-500">
                            {c.whatsapp_number}
                          </p>
                        </div>
                      </Link>
                      <div className="flex flex-col items-end">
                        <span className="font-display text-sm font-semibold text-neutral-900">
                          {formatRupiah(c.total_spent_cents)}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {c.orders} order
                        </span>
                      </div>
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
                <h2 className="font-semibold text-neutral-900">
                  Status Pesanan
                </h2>
              </div>
              {Object.keys(data.status_breakdown).length === 0 ? (
                <p className="text-sm text-neutral-500">Belum ada data.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {Object.entries(data.status_breakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <li key={status}>
                        <Badge variant="outline" className="px-3 py-1">
                          {statusLabel[status] || status}
                          <span className="ml-1.5 font-semibold text-neutral-900">
                            {count}
                          </span>
                        </Badge>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Wallet className="size-4 text-neutral-500" aria-hidden />
                <h2 className="font-semibold text-neutral-900">
                  Metode Pembayaran
                </h2>
              </div>
              {Object.keys(data.payment_breakdown).length === 0 ? (
                <p className="text-sm text-neutral-500">Belum ada data.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {Object.entries(data.payment_breakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, count]) => (
                      <li key={method}>
                        <Badge variant="outline" className="px-3 py-1">
                          {method}
                          <span className="ml-1.5 font-semibold text-neutral-900">
                            {count}
                          </span>
                        </Badge>
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
