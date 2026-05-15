import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { PrintBar } from "@/components/dashboard/print-bar";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateTimeID } from "@/lib/format";
import type { OrderDetail, Store } from "@/lib/types";

export const metadata = { title: "Cetak Nota - SellOn" };

const statusLabel: Record<OrderDetail["status"], string> = {
  pending: "Menunggu",
  confirmed: "Dikonfirmasi",
  processing: "Diproses",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const paymentLabel: Record<OrderDetail["payment_status"], string> = {
  unpaid: "Belum bayar",
  pending: "Menunggu verifikasi",
  paid: "Lunas",
  failed: "Gagal",
  refunded: "Refund",
};

export default async function NotaCetakPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { id } = await params;

  const [orderRes, storeRes] = await Promise.all([
    serverApi<{ order: OrderDetail }>(`/api/v1/orders/${id}`),
    serverApi<{ store: Store | null }>("/api/v1/store"),
  ]);
  if (!orderRes?.order) notFound();
  const order = orderRes.order;
  const store = storeRes?.store ?? null;

  return (
    <>
      <PrintBar backHref={`/orders/${order.id}`} />

      <article className="mx-auto max-w-3xl px-6 py-10 print:px-0 print:py-0">
        {/* Header */}
        <header className="flex items-start justify-between border-b-2 border-neutral-900 pb-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-neutral-900">
              {store?.name || "SellOn"}
            </h1>
            {store?.city && (
              <p className="mt-1 text-sm text-neutral-700">{store.city}</p>
            )}
            {store?.whatsapp_number && (
              <p className="text-sm text-neutral-700">
                WhatsApp: {store.whatsapp_number}
              </p>
            )}
            {store?.slug && (
              <p className="text-xs text-neutral-500">sellon.id/{store.slug}</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-semibold text-neutral-900">
              NOTA / INVOICE
            </p>
            <p className="mt-1 font-mono text-sm text-neutral-700">
              {order.order_number}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {formatDateTimeID(order.created_at)} WIB
            </p>
          </div>
        </header>

        {/* Customer + status side-by-side */}
        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Dikirim Ke
            </h2>
            <p className="font-semibold text-neutral-900">
              {order.customer_name}
            </p>
            <p className="font-mono text-xs text-neutral-700">
              {order.customer_whatsapp}
            </p>
            {order.customer_address && (
              <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                {order.customer_address}
                {order.customer_city ? `, ${order.customer_city}` : ""}
              </p>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Status
            </h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-600">Pesanan</dt>
                <dd className="font-medium text-neutral-900">
                  {statusLabel[order.status]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-600">Pembayaran</dt>
                <dd className="font-medium text-neutral-900">
                  {paymentLabel[order.payment_status]}
                </dd>
              </div>
              {order.payment_method && (
                <div className="flex justify-between">
                  <dt className="text-neutral-600">Metode</dt>
                  <dd className="font-medium text-neutral-900">
                    {order.payment_method}
                  </dd>
                </div>
              )}
              {order.courier && (
                <div className="flex justify-between">
                  <dt className="text-neutral-600">Kurir</dt>
                  <dd className="font-medium text-neutral-900">
                    {order.courier}
                  </dd>
                </div>
              )}
              {order.tracking_number && (
                <div className="flex justify-between">
                  <dt className="text-neutral-600">No. Resi</dt>
                  <dd className="font-mono text-xs text-neutral-900">
                    {order.tracking_number}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        {/* Items */}
        <section className="mt-8">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-neutral-300">
              <tr>
                <th className="py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Produk
                </th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Qty
                </th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Harga
                </th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3">
                    <p className="font-medium text-neutral-900">
                      {it.product_name}
                    </p>
                    {it.variant_name && (
                      <p className="text-xs text-neutral-500">
                        {it.variant_name}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-right text-neutral-700">
                    {it.quantity}
                  </td>
                  <td className="py-3 text-right text-neutral-700">
                    {formatRupiah(it.unit_price_cents)}
                  </td>
                  <td className="py-3 text-right font-medium text-neutral-900">
                    {formatRupiah(it.subtotal_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="ml-auto mt-4 flex max-w-xs flex-col gap-1.5 text-sm">
            <div className="flex justify-between text-neutral-600">
              <dt>Subtotal</dt>
              <dd>{formatRupiah(order.subtotal_cents)}</dd>
            </div>
            <div className="flex justify-between text-neutral-600">
              <dt>Ongkir</dt>
              <dd>{formatRupiah(order.shipping_cents)}</dd>
            </div>
            <div className="flex justify-between border-t-2 border-neutral-900 pt-2 font-display text-base font-bold text-neutral-900">
              <dt>TOTAL</dt>
              <dd>{formatRupiah(order.total_cents)}</dd>
            </div>
          </dl>
        </section>

        {/* Notes */}
        {(order.notes || order.seller_notes) && (
          <section className="mt-8 border-t border-neutral-200 pt-4 text-sm">
            {order.notes && (
              <div className="mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Catatan dari pembeli
                </h3>
                <p className="mt-1 whitespace-pre-line text-neutral-700">
                  {order.notes}
                </p>
              </div>
            )}
            {order.seller_notes && (
              <div className="print:hidden">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Catatan internal (tidak ikut tercetak)
                </h3>
                <p className="mt-1 whitespace-pre-line text-neutral-700">
                  {order.seller_notes}
                </p>
              </div>
            )}
          </section>
        )}

        <footer className="mt-10 border-t border-neutral-300 pt-6 text-center text-xs text-neutral-500">
          <p>Terima kasih sudah belanja di {store?.name || "toko kami"}!</p>
          <p className="mt-1">
            Nota ini diterbitkan otomatis oleh SellOn - sellon.id
          </p>
        </footer>

        {/* Back link - print:hidden */}
        <div className="mt-8 text-center print:hidden">
          <Link
            href={`/orders/${order.id}`}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← Kembali ke detail pesanan
          </Link>
        </div>
      </article>
    </>
  );
}
