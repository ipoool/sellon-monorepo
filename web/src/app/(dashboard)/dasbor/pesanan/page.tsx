import { redirect } from "next/navigation";
import { Inbox, Send } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateTimeID } from "@/lib/format";
import type { Order } from "@/lib/types";

export const metadata = { title: "Pesanan — SellOn" };

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

export default async function PesananPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  const data = await serverApi<{ orders: Order[] }>("/api/v1/orders");
  const orders = data?.orders ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Pesanan"
      pageSubtitle={`${orders.length} pesanan tercatat`}
    >
      {orders.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Inbox className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada pesanan
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Bagikan link katalog ke WhatsApp grup pelanggan-mu — saat
            ada yang order, akan muncul di sini real-time.
          </p>
          <div className="mt-6">
            <Button>
              <Send className="size-4" aria-hidden />
              Bagikan Katalog
            </Button>
          </div>
          <p className="mt-6 text-xs text-neutral-500">
            Halaman ini akan otomatis menampilkan pesanan begitu integrasi
            checkout publik selesai dirilis.
          </p>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3 font-mono text-xs text-neutral-700">
                    {o.order_number}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
