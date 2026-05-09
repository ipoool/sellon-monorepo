import { Crown, Check, Calendar, Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BerlanggananActions } from "@/components/dashboard/berlangganan-actions";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { Subscription, SubscriptionInvoice } from "@/lib/types";

export const metadata = { title: "Berlangganan — SellOn" };

const planLabel: Record<Subscription["plan"], string> = {
  free: "Gratis",
  pro: "Pro",
};

const statusBadge: Record<
  Subscription["status"],
  { variant: "success" | "warning" | "default"; label: string }
> = {
  active: { variant: "success", label: "Aktif" },
  cancelled: { variant: "warning", label: "Dibatalkan" },
  expired: { variant: "default", label: "Kadaluarsa" },
};

const invoiceStatusBadge: Record<
  SubscriptionInvoice["status"],
  { variant: "success" | "warning" | "default"; label: string }
> = {
  paid: { variant: "success", label: "Lunas" },
  pending: { variant: "warning", label: "Menunggu verifikasi" },
  failed: { variant: "default", label: "Gagal" },
};

export default async function BerlanggananPage() {
  const data = await serverApi<{
    subscription: Subscription;
    invoices: SubscriptionInvoice[];
  }>("/api/v1/subscription");
  const sub: Subscription = data?.subscription ?? {
    plan: "free",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancelled_at: null,
    days_remaining: 0,
    pro_price_cents: 49_000_00,
  };
  const invoices = data?.invoices ?? [];
  const isPro = sub.plan === "pro" && sub.status !== "expired";

  return (
    <div className="flex flex-col gap-5">
      {/* Current plan card */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-neutral-900">
                Tier Aktif
              </h2>
              <Badge variant={statusBadge[sub.status].variant}>
                {statusBadge[sub.status].label}
              </Badge>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              {isPro && (
                <Crown className="size-5 text-warning" aria-hidden />
              )}
              <p className="font-display text-3xl font-semibold text-neutral-900">
                {planLabel[sub.plan]}
              </p>
            </div>

            {isPro && sub.current_period_end && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-neutral-600">
                <Calendar className="size-4" aria-hidden />
                <span>
                  {sub.status === "cancelled" ? (
                    <>
                      Akses Pro berakhir{" "}
                      <strong>{formatDateID(sub.current_period_end)}</strong>
                    </>
                  ) : (
                    <>
                      Perpanjang sebelum{" "}
                      <strong>{formatDateID(sub.current_period_end)}</strong>{" "}
                      ({sub.days_remaining} hari lagi)
                    </>
                  )}
                </span>
              </div>
            )}

            {!isPro && (
              <p className="mt-3 text-sm text-neutral-600">
                Anda di tier Gratis. Upgrade ke Pro untuk membuka semua fitur
                tanpa batasan.
              </p>
            )}
          </div>

          <div className="shrink-0">
            <BerlanggananActions subscription={sub} />
          </div>
        </div>
      </Card>

      {/* Plan comparison */}
      {!isPro && (
        <Card>
          <h2 className="font-semibold text-neutral-900">Apa yang dapat Pro?</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-neutral-900">Gratis</h3>
                <Badge variant="default">Sekarang</Badge>
              </div>
              <p className="mt-1 font-display text-xl font-semibold text-neutral-900">
                Rp 0
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm text-neutral-700">
                {[
                  "Maks 30 produk",
                  "Maks 50 order/bulan",
                  "Laporan 7 hari",
                  "Watermark SellOn di halaman toko",
                ].map((b) => (
                  <li key={b} className="flex items-center gap-1.5">
                    <Check
                      className="size-3.5 text-neutral-400"
                      aria-hidden
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-brand-300 bg-brand-50/30 p-4 ring-2 ring-brand-500/15">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-neutral-900">Pro</h3>
                <Badge variant="brand">Recommended</Badge>
              </div>
              <p className="mt-1 font-display text-xl font-semibold text-neutral-900">
                {formatRupiah(sub.pro_price_cents)}
                <span className="text-sm font-normal text-neutral-600">
                  /bulan
                </span>
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm text-neutral-700">
                {[
                  "Produk & varian tak terbatas",
                  "Order tak terbatas",
                  "Bulk upload via Excel",
                  "Laporan & insight 90 hari",
                  "Promo + kupon diskon",
                  "Tanpa watermark di halaman toko",
                ].map((b) => (
                  <li key={b} className="flex items-center gap-1.5">
                    <Check
                      className="size-3.5 text-brand-600"
                      aria-hidden
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Invoice history */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="size-4 text-neutral-500" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Riwayat Pembayaran</h2>
        </div>

        {invoices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
            Belum ada riwayat pembayaran.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-neutral-900">
                    {formatRupiah(inv.amount_cents)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatDateID(inv.created_at)}
                    {inv.notes ? ` · ${inv.notes}` : ""}
                  </p>
                </div>
                <Badge variant={invoiceStatusBadge[inv.status].variant}>
                  {invoiceStatusBadge[inv.status].label}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
