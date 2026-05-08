import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { BuyerPaymentPanel } from "@/components/storefront/buyer-payment-panel";
import { formatRupiah, formatDateTimeID } from "@/lib/format";

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

type BuyerOrderItem = {
  product_name: string;
  variant_name: string;
  unit_price_cents: number;
  quantity: number;
  subtotal_cents: number;
};

type BuyerOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  courier: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_address: string;
  customer_city: string;
  payment_url: string;
  created_at: string;
  items: BuyerOrderItem[];
};

type PublicBank = {
  bank_name: string;
  holder_name: string;
  account_no: string;
  is_primary: boolean;
  qris_url: string;
};

type Resp = {
  store: { slug: string; name: string; whatsapp_number: string };
  order: BuyerOrder;
  bank_accounts: PublicBank[];
};

async function fetchOrder(slug: string, num: string): Promise<Resp | null> {
  try {
    const res = await fetch(
      `${apiBase}/api/v1/storefront/${slug}/orders/${num}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as Resp;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; orderNumber: string }>;
}): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Pesanan ${orderNumber} — SellOn` };
}

const statusBadge: Record<string, { variant: "success" | "warning" | "default" | "brand"; label: string }> = {
  pending: { variant: "warning", label: "Menunggu Konfirmasi" },
  confirmed: { variant: "brand", label: "Dikonfirmasi Penjual" },
  processing: { variant: "brand", label: "Sedang Diproses" },
  shipped: { variant: "brand", label: "Sudah Dikirim" },
  completed: { variant: "success", label: "Selesai" },
  cancelled: { variant: "default", label: "Dibatalkan" },
};

const paymentBadge: Record<string, { variant: "success" | "warning" | "default"; label: string }> = {
  unpaid: { variant: "default", label: "Belum Bayar" },
  pending: { variant: "warning", label: "Menunggu Verifikasi" },
  paid: { variant: "success", label: "Lunas" },
  failed: { variant: "default", label: "Gagal" },
  refunded: { variant: "default", label: "Refund" },
};

export default async function BuyerOrderPage({
  params,
}: {
  params: Promise<{ slug: string; orderNumber: string }>;
}) {
  const { slug, orderNumber } = await params;
  const data = await fetchOrder(slug, orderNumber);
  if (!data) notFound();

  const { store, order, bank_accounts } = data;
  const isPaid = order.payment_status === "paid";
  const isPending = order.payment_status === "pending";
  const showPayment =
    !isPaid && order.status !== "cancelled" && (bank_accounts.length > 0 || order.payment_url);

  return (
    <div className="min-h-svh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <Container>
          <div className="flex h-14 items-center gap-3">
            <Link
              href={`/${slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {store.name}
            </Link>
          </div>
        </Container>
      </header>

      <main className="py-6 lg:py-10">
        <Container>
          <div className="mx-auto max-w-3xl">
            {/* Status banner */}
            <div
              className={
                isPaid
                  ? "mb-6 flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4 text-sm"
                  : isPending
                    ? "mb-6 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
                    : "mb-6 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm"
              }
            >
              {isPaid ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
              ) : (
                <Clock className="size-5 shrink-0 text-warning" aria-hidden />
              )}
              <div>
                <p className="font-medium text-neutral-900">
                  {isPaid
                    ? "Pembayaran berhasil"
                    : isPending
                      ? "Menunggu verifikasi pembayaran"
                      : "Selesaikan pembayaran"}
                </p>
                <p className="mt-0.5 text-neutral-600">
                  {isPaid
                    ? "Penjual akan segera proses pesananmu. Pantau update via WhatsApp."
                    : isPending
                      ? "Penjual sedang verifikasi bukti transfer-mu. Mohon tunggu."
                      : "Pilih salah satu metode pembayaran di bawah, lalu klik 'Aku sudah bayar' setelah selesai."}
                </p>
              </div>
            </div>

            {/* Order summary */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-neutral-500">
                    Nomor Pesanan
                  </p>
                  <p className="font-mono text-base font-semibold text-neutral-900">
                    {order.order_number}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatDateTimeID(order.created_at)} WIB
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={statusBadge[order.status]?.variant ?? "default"}>
                    {statusBadge[order.status]?.label ?? order.status}
                  </Badge>
                  <Badge
                    variant={paymentBadge[order.payment_status]?.variant ?? "default"}
                  >
                    {paymentBadge[order.payment_status]?.label ?? order.payment_status}
                  </Badge>
                </div>
              </div>

              <div className="mt-5 border-t border-neutral-200 pt-5">
                <h2 className="text-sm font-semibold text-neutral-900">Ringkasan</h2>
                <ul className="mt-3 flex flex-col divide-y divide-neutral-200">
                  {order.items.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-neutral-900">
                          {it.product_name}
                          {it.variant_name && ` — ${it.variant_name}`}
                        </p>
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
                <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                  <div className="flex justify-between text-neutral-600">
                    <dt>Subtotal</dt>
                    <dd>{formatRupiah(order.subtotal_cents)}</dd>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <dt>Ongkir{order.courier ? ` (${order.courier})` : ""}</dt>
                    <dd>{formatRupiah(order.shipping_cents)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-neutral-200 pt-2 font-display text-base font-semibold text-neutral-900">
                    <dt>Total</dt>
                    <dd>{formatRupiah(order.total_cents)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5 border-t border-neutral-200 pt-5">
                <h2 className="text-sm font-semibold text-neutral-900">
                  Dikirim Ke
                </h2>
                <div className="mt-2 text-sm text-neutral-700">
                  <p className="font-medium text-neutral-900">{order.customer_name}</p>
                  <p className="font-mono text-xs text-neutral-500">
                    {order.customer_whatsapp}
                  </p>
                  {order.customer_address && (
                    <p className="mt-1 whitespace-pre-line">
                      {order.customer_address}
                      {order.customer_city ? `, ${order.customer_city}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Payment panel */}
            {showPayment && (
              <div className="mt-5">
                <BuyerPaymentPanel
                  storeSlug={slug}
                  storeName={store.name}
                  storeWhatsApp={store.whatsapp_number}
                  orderNumber={order.order_number}
                  totalCents={order.total_cents}
                  paymentURL={order.payment_url}
                  bankAccounts={bank_accounts}
                />
              </div>
            )}
          </div>
        </Container>
      </main>
    </div>
  );
}
