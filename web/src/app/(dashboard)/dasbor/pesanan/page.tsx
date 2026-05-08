import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox, Send, ArrowRight, Download } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateTimeID } from "@/lib/format";
import type { Order } from "@/lib/types";

export const metadata = { title: "Pesanan — SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const statusBadge: Record<Order["status"], { variant: "success" | "default" | "warning" | "brand"; label: string }> = {
  pending: { variant: "warning", label: "Menunggu" },
  confirmed: { variant: "brand", label: "Dikonfirmasi" },
  processing: { variant: "brand", label: "Diproses" },
  shipped: { variant: "brand", label: "Dikirim" },
  completed: { variant: "success", label: "Selesai" },
  cancelled: { variant: "default", label: "Dibatalkan" },
};

const paymentBadge: Record<Order["payment_status"], { variant: "success" | "default" | "warning"; label: string }> = {
  unpaid: { variant: "default", label: "Belum bayar" },
  pending: { variant: "warning", label: "Menunggu" },
  paid: { variant: "success", label: "Lunas" },
  failed: { variant: "default", label: "Gagal" },
  refunded: { variant: "default", label: "Refund" },
};

export default async function PesananPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; payment_status?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/masuk");
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "";
  const paymentStatus = sp.payment_status ?? "";

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (paymentStatus) params.set("payment_status", paymentStatus);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const data = await serverApi<{ orders: Order[] }>(`/api/v1/orders${qs}`);
  const orders = data?.orders ?? [];
  const isFiltered = Boolean(q || status || paymentStatus);

  const exportHref = `${apiBase}/api/v1/orders/export${qs}`;

  return (
    <DashboardShell
      me={me}
      pageTitle="Pesanan"
      pageSubtitle={`${orders.length} pesanan${isFiltered ? " (terfilter)" : ""}`}
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
      {/* Filter form */}
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
              <option value="pending">Menunggu</option>
              <option value="paid">Lunas</option>
              <option value="failed">Gagal</option>
              <option value="refunded">Refund</option>
            </Select>
          </div>
          <Button type="submit" size="md" variant="outline">
            Filter
          </Button>
          {isFiltered && (
            <Link href="/dasbor/pesanan">
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
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3">No. Order</th>
                <th className="px-5 py-3">Pembeli</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Pembayaran</th>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3 font-mono text-xs text-neutral-700">
                    <Link
                      href={`/dasbor/pesanan/${o.id}`}
                      className="hover:text-brand-700"
                    >
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-medium text-neutral-900">
                        {o.customer_name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {o.customer_city}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-medium text-neutral-900">
                    {formatRupiah(o.total_cents)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={statusBadge[o.status].variant}>
                      {statusBadge[o.status].label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={paymentBadge[o.payment_status].variant}>
                      {paymentBadge[o.payment_status].label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {formatDateTimeID(o.created_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/dasbor/pesanan/${o.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Detail
                      <ArrowRight className="size-3.5" aria-hidden />
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
