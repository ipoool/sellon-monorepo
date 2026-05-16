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

export default async function PesananPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    payment_status?: string;
    page?: string;
  }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "";
  const paymentStatus = sp.payment_status ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (paymentStatus) params.set("payment_status", paymentStatus);
  // Filters-only QS for the export link (server export ignores paging).
  const qs = params.toString() ? `?${params.toString()}` : "";

  const apiParams = new URLSearchParams(params);
  apiParams.set("limit", String(PAGE_SIZE));
  apiParams.set("offset", String((page - 1) * PAGE_SIZE));

  const [data, subRes] = await Promise.all([
    serverApi<{ orders: Order[]; total: number }>(
      `/api/v1/orders?${apiParams.toString()}`,
    ),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);
  const orders = data?.orders ?? [];
  const total = data?.total ?? orders.length;
  const isFiltered = Boolean(q || status || paymentStatus);
  const sub = subRes?.subscription;
  const orderQuota = sub?.quotas?.orders;
  const isOrderCapped = !!orderQuota && orderQuota.limit > 0;
  const tierLabel =
    sub?.plan === "pro" ? "Pro" : sub?.plan === "bisnis" ? "Bisnis" : "Gratis";

  const exportHref = `${apiBase}/api/v1/orders/export${qs}`;

  return (
    <DashboardShell
      me={me}
      pageTitle="Pesanan"
      pageSubtitle={`${total} pesanan${isFiltered ? " (terfilter)" : ""}`}
      actions={
        <a
          href={exportHref}
          download
          target="_blank"
          rel="noopener noreferrer"
        >
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

      <form
        method="GET"
        className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="flex-1">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Cari nomor order atau nama pembeli…"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
          <div className="sm:w-44">
            <Select name="status" defaultValue={status}>
              <option value="">Semua status</option>
              <option value="pending">Menunggu</option>
              <option value="confirmed">Dikonfirmasi</option>
              <option value="processing">Diproses</option>
              <option value="shipped">Dikirim</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Dibatalkan</option>
            </Select>
          </div>
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
            <Link href="/orders">
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
            {isFiltered ? "Tidak ada pesanan yang cocok" : "Belum ada pesanan"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            {isFiltered
              ? "Coba ubah kata kunci atau reset filter."
              : "Bagikan link katalog ke WhatsApp grup pelanggan-mu — saat ada yang order, akan muncul di sini."}
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
