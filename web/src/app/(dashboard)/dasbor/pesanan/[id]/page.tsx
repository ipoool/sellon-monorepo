import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Truck,
  CreditCard,
  StickyNote,
  Package,
  Printer,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderStatusActions } from "@/components/dashboard/order-status-actions";
import { OrderTimeline } from "@/components/dashboard/order-timeline";
import { OrderQuickWA } from "@/components/dashboard/order-quick-wa";
import { OrderSellerNotes } from "@/components/dashboard/order-seller-notes";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateTimeID } from "@/lib/format";
import type { OrderDetail, Store } from "@/lib/types";

export const metadata = { title: "Detail Pesanan — SellOn" };

const statusBadge: Record<
  OrderDetail["status"],
  { variant: "success" | "default" | "warning" | "brand"; label: string }
> = {
  pending: { variant: "warning", label: "Menunggu" },
  confirmed: { variant: "brand", label: "Dikonfirmasi" },
  processing: { variant: "brand", label: "Diproses" },
  shipped: { variant: "brand", label: "Dikirim" },
  completed: { variant: "success", label: "Selesai" },
  cancelled: { variant: "default", label: "Dibatalkan" },
};

const paymentBadge: Record<
  OrderDetail["payment_status"],
  { variant: "success" | "default" | "warning"; label: string }
> = {
  unpaid: { variant: "default", label: "Belum bayar" },
  pending: { variant: "warning", label: "Menunggu" },
  paid: { variant: "success", label: "Lunas" },
  failed: { variant: "default", label: "Gagal" },
  refunded: { variant: "default", label: "Refund" },
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/masuk");
  const { id } = await params;

  const [orderRes, storeRes] = await Promise.all([
    serverApi<{ order: OrderDetail }>(`/api/v1/orders/${id}`),
    serverApi<{ store: Store | null }>("/api/v1/store"),
  ]);
  if (!orderRes?.order) notFound();
  const order = orderRes.order;
  const store = storeRes?.store ?? null;

  return (
    <DashboardShell
      me={me}
      pageTitle={`Pesanan ${order.order_number}`}
      pageSubtitle={`Dibuat ${formatDateTimeID(order.created_at)} WIB`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/dasbor/pesanan"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke daftar pesanan
        </Link>
        <Link
          href={`/dasbor/pesanan/${order.id}/cetak`}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <Printer className="size-4" aria-hidden />
          Cetak Nota
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left column: status + items + customer */}
        <div className="flex flex-col gap-5 lg:col-span-8">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadge[order.status].variant}>
                {statusBadge[order.status].label}
              </Badge>
              <Badge variant={paymentBadge[order.payment_status].variant}>
                Pembayaran: {paymentBadge[order.payment_status].label}
              </Badge>
              {order.cancellation_reason && (
                <span className="text-xs text-neutral-500">
                  Alasan: {order.cancellation_reason}
                </span>
              )}
            </div>

            <OrderStatusActions order={order} className="mt-5" />
          </Card>

          {/* Items */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Package className="size-4 text-neutral-500" aria-hidden />
              <h2 className="font-semibold text-neutral-900">Produk Dipesan</h2>
            </div>
            <ul className="flex flex-col divide-y divide-neutral-200">
              {order.items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-start justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-neutral-900">
                      {it.product_name}
                    </p>
                    {it.variant_name && (
                      <p className="text-xs text-neutral-500">
                        Varian: {it.variant_name}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {it.quantity} × {formatRupiah(it.unit_price_cents)}
                    </p>
                  </div>
                  <p className="font-medium text-neutral-900">
                    {formatRupiah(it.subtotal_cents)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-col gap-1.5 border-t border-neutral-200 pt-4 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>{formatRupiah(order.subtotal_cents)}</span>
              </div>
              {order.discount_cents > 0 && (
                <div className="flex justify-between text-success">
                  <span>
                    Diskon{order.promo_code ? ` (${order.promo_code})` : ""}
                  </span>
                  <span>−{formatRupiah(order.discount_cents)}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-600">
                <span>Ongkir{order.courier ? ` (${order.courier})` : ""}</span>
                <span>{formatRupiah(order.shipping_cents)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 font-display text-base font-semibold text-neutral-900">
                <span>Total</span>
                <span>{formatRupiah(order.total_cents)}</span>
              </div>
            </div>
          </Card>

          {/* Customer */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <User className="size-4 text-neutral-500" aria-hidden />
              <h2 className="font-semibold text-neutral-900">Pembeli</h2>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Nama
                </dt>
                <dd className="mt-0.5 font-medium text-neutral-900">
                  {order.customer_name}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  <Phone className="size-3" aria-hidden /> WhatsApp
                </dt>
                <dd className="mt-0.5 font-mono text-xs text-neutral-900">
                  {order.customer_whatsapp}
                </dd>
              </div>
              {order.customer_address && (
                <div className="sm:col-span-2">
                  <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
                    <MapPin className="size-3" aria-hidden /> Alamat
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-line text-neutral-700">
                    {order.customer_address}
                    {order.customer_city ? `, ${order.customer_city}` : ""}
                  </dd>
                </div>
              )}
              {order.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Catatan dari pembeli
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-line text-neutral-700">
                    {order.notes}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Shipping */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Truck className="size-4 text-neutral-500" aria-hidden />
              <h2 className="font-semibold text-neutral-900">Pengiriman</h2>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Kurir
                </dt>
                <dd className="mt-0.5 text-neutral-900">
                  {order.courier || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  No. Resi
                </dt>
                <dd className="mt-0.5 font-mono text-xs text-neutral-900">
                  {order.tracking_number || "—"}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Payment */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="size-4 text-neutral-500" aria-hidden />
              <h2 className="font-semibold text-neutral-900">Pembayaran</h2>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Metode
                </dt>
                <dd className="mt-0.5 text-neutral-900">
                  {order.payment_method || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Status
                </dt>
                <dd className="mt-0.5">
                  <Badge variant={paymentBadge[order.payment_status].variant}>
                    {paymentBadge[order.payment_status].label}
                  </Badge>
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* Right column: timeline + WA + seller notes */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <Card>
            <h2 className="mb-4 font-semibold text-neutral-900">Riwayat Status</h2>
            <OrderTimeline order={order} />
          </Card>

          <OrderQuickWA order={order} storeName={store?.name ?? "Toko"} />

          <Card>
            <div className="mb-3 flex items-center gap-2">
              <StickyNote className="size-4 text-neutral-500" aria-hidden />
              <h2 className="font-semibold text-neutral-900">Catatan Internal</h2>
            </div>
            <OrderSellerNotes
              orderId={order.id}
              initialNotes={order.seller_notes}
            />
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
