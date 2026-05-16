import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Mail,
  ShoppingBag,
  Wallet,
  Calendar,
  Phone,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerProfileForm } from "@/components/dashboard/customer-profile-form";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateID, formatDateTimeID } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import type {
  Customer,
  CustomerOrderSummary,
  OrderStatus,
  PaymentStatus,
} from "@/lib/types";

export const metadata = { title: "Detail Pelanggan — SellOn" };

const orderStatusLabel: Record<OrderStatus, string> = {
  pending: "Menunggu",
  confirmed: "Dikonfirmasi",
  processing: "Diproses",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const paymentStatusLabel: Record<PaymentStatus, string> = {
  unpaid: "Belum bayar",
  pending: "Menunggu verifikasi",
  paid: "Lunas",
  failed: "Gagal",
  refunded: "Direfund",
};

function classifySegment(c: Customer): {
  label: string;
  variant: "default" | "brand" | "success" | "warning";
} {
  if (c.is_blacklisted) return { label: "Blacklist", variant: "warning" };
  if (c.total_orders >= 10) return { label: "VIP", variant: "brand" };
  if (c.total_orders >= 3) return { label: "Loyal", variant: "success" };
  if (c.total_orders >= 1) return { label: "Reguler", variant: "default" };
  return { label: "Baru", variant: "default" };
}

export default async function PelangganDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { id } = await params;

  const data = await serverApi<{
    customer: Customer;
    orders: CustomerOrderSummary[];
  }>(`/api/v1/customers/${id}`);
  if (!data) notFound();
  const { customer, orders } = data;
  const seg = classifySegment(customer);

  const waUrl = customer.whatsapp_number
    ? waLink(
        customer.whatsapp_number,
        `Halo ${customer.name}, ada update dari tokomu :)`,
      )
    : "";

  return (
    <DashboardShell
      me={me}
      pageTitle={customer.name}
      pageSubtitle={customer.whatsapp_number || "—"}
    >
      <div className="mb-4">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke daftar pelanggan
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Profile column */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <Card>
            <div className="flex items-center gap-4">
              <Avatar name={customer.name} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-semibold text-neutral-900">
                  {customer.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant={seg.variant}>{seg.label}</Badge>
                  {customer.created_at && (
                    <span className="text-xs text-neutral-500">
                      Bergabung {formatDateID(customer.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <dl className="mt-5 flex flex-col gap-2 text-sm">
              <div className="flex items-start gap-2.5">
                <Phone className="mt-0.5 size-4 text-neutral-400" aria-hidden />
                <div>
                  <dt className="text-xs text-neutral-500">WhatsApp</dt>
                  <dd className="font-mono text-neutral-800">
                    {customer.whatsapp_number || "—"}
                  </dd>
                </div>
              </div>
              {customer.email && (
                <div className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 size-4 text-neutral-400" aria-hidden />
                  <div>
                    <dt className="text-xs text-neutral-500">Email</dt>
                    <dd className="text-neutral-800">{customer.email}</dd>
                  </div>
                </div>
              )}
              {(customer.address || customer.city) && (
                <div className="flex items-start gap-2.5">
                  <MapPin
                    className="mt-0.5 size-4 text-neutral-400"
                    aria-hidden
                  />
                  <div>
                    <dt className="text-xs text-neutral-500">Alamat</dt>
                    <dd className="text-neutral-800">
                      {customer.address ? `${customer.address}, ` : ""}
                      {[customer.city, customer.province]
                        .filter(Boolean)
                        .join(", ") || "—"}
                      {customer.postal_code ? ` ${customer.postal_code}` : ""}
                    </dd>
                  </div>
                </div>
              )}
            </dl>

            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block"
              >
                <Button size="sm" variant="outline" className="w-full">
                  Hubungi via WhatsApp
                </Button>
              </a>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-neutral-900">
              Lifetime stats
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-neutral-200 p-3">
                <ShoppingBag
                  className="mx-auto size-4 text-neutral-400"
                  aria-hidden
                />
                <p className="mt-1 font-display text-lg font-semibold text-neutral-900">
                  {customer.total_orders}
                </p>
                <p className="text-xs text-neutral-500">Order</p>
              </div>
              <div className="rounded-lg border border-neutral-200 p-3">
                <Wallet
                  className="mx-auto size-4 text-neutral-400"
                  aria-hidden
                />
                <p className="mt-1 font-display text-lg font-semibold text-neutral-900">
                  {formatRupiah(customer.total_spent_cents)}
                </p>
                <p className="text-xs text-neutral-500">Belanja</p>
              </div>
              <div className="rounded-lg border border-neutral-200 p-3">
                <Calendar
                  className="mx-auto size-4 text-neutral-400"
                  aria-hidden
                />
                <p className="mt-1 text-sm font-semibold text-neutral-900">
                  {customer.last_order_at
                    ? formatDateID(customer.last_order_at)
                    : "—"}
                </p>
                <p className="text-xs text-neutral-500">Terakhir</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-neutral-900">
              Catatan & status
            </h3>
            <div className="mt-3">
              <CustomerProfileForm
                customerId={customer.id}
                initialNotes={customer.notes ?? ""}
                initialBlacklisted={customer.is_blacklisted ?? false}
              />
            </div>
          </Card>
        </div>

        {/* Order history column */}
        <div className="lg:col-span-7">
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">
                Riwayat Pesanan
              </h3>
              <span className="text-xs text-neutral-500">
                {orders.length} pesanan terakhir
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
                Belum ada pesanan dari pelanggan ini.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-neutral-200">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/orders/${o.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-neutral-50"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium text-neutral-900">
                          {o.order_number}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {formatDateTimeID(o.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-display text-sm font-semibold text-neutral-900">
                          {formatRupiah(o.total_cents)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">
                            {orderStatusLabel[o.status]}
                          </Badge>
                          <Badge
                            variant={
                              o.payment_status === "paid"
                                ? "success"
                                : o.payment_status === "pending"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {paymentStatusLabel[o.payment_status]}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
