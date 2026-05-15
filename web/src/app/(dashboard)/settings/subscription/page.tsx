import { Crown, Check, Calendar, Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BerlanggananActions } from "@/components/dashboard/berlangganan-actions";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateID } from "@/lib/format";
import { quotaBullets } from "@/lib/plan-bullets";
import type {
  PublicPlan,
  Subscription,
  SubscriptionInvoice,
} from "@/lib/types";

export const metadata = { title: "Berlangganan — SellOn" };

const planLabel: Record<Subscription["plan"], string> = {
  free: "Gratis",
  pro: "Pro",
  bisnis: "Bisnis",
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
  const [data, plansRes] = await Promise.all([
    serverApi<{
      subscription: Subscription;
      invoices: SubscriptionInvoice[];
    }>("/api/v1/subscription"),
    serverApi<{ plans: PublicPlan[] }>("/api/v1/plans"),
  ]);
  const sub: Subscription = data?.subscription ?? {
    plan: "free",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancelled_at: null,
    days_remaining: 0,
    pro_price_cents: 99_000_00,
    bisnis_price_cents: 299_000_00,
  };
  const invoices = data?.invoices ?? [];
  const plans = plansRes?.plans ?? [];
  // Stable lookup by tier for the comparison cards.
  const planByTier = new Map(plans.map((p) => [p.tier, p]));
  const freePlan = planByTier.get("free");
  const proPlan = planByTier.get("pro");
  const bisnisPlan = planByTier.get("bisnis");
  const isPaid =
    (sub.plan === "pro" || sub.plan === "bisnis") &&
    sub.status !== "expired";

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
              {isPaid && (
                <Crown className="size-5 text-warning" aria-hidden />
              )}
              <p className="font-display text-3xl font-semibold text-neutral-900">
                {planLabel[sub.plan]}
              </p>
            </div>

            {isPaid && sub.current_period_end && (
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

            {!isPaid && (
              <p className="mt-3 text-sm text-neutral-600">
                Anda di tier Gratis. Upgrade ke Pro untuk membuka semua fitur
                tanpa batasan.
              </p>
            )}
          </div>

          <div className="shrink-0">
            <BerlanggananActions
              subscription={sub}
              invoices={invoices}
              plans={plans}
            />
          </div>
        </div>
      </Card>

      {/* Plan comparison */}
      {!isPaid && plans.length > 0 && (
        <Card>
          <h2 className="font-semibold text-neutral-900">
            Apa yang dapat {proPlan?.name ?? "Pro"}?
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {freePlan && (
              <PlanComparisonCard
                plan={freePlan}
                badgeLabel="Sekarang"
                badgeVariant="default"
                emphasized={false}
              />
            )}
            {proPlan && (
              <PlanComparisonCard
                plan={proPlan}
                badgeLabel="Recommended"
                badgeVariant="brand"
                emphasized
              />
            )}
            {bisnisPlan && (
              <PlanComparisonCard
                plan={bisnisPlan}
                badgeLabel="Untuk scale"
                badgeVariant="outline"
                emphasized={false}
              />
            )}
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

type ComparisonBadgeVariant = "default" | "brand" | "outline";

function PlanComparisonCard({
  plan,
  badgeLabel,
  badgeVariant,
  emphasized,
}: {
  plan: PublicPlan;
  badgeLabel: string;
  badgeVariant: ComparisonBadgeVariant;
  emphasized: boolean;
}) {
  const isFree = plan.tier === "free";
  const priceLabel = isFree ? "Rp 0" : formatRupiah(plan.monthly_price_cents);
  const periodLabel = isFree ? "" : "/bulan";
  // Mix dynamic quotas (so admin limit changes flow through) with the
  // editable feature bullets from /platform/plans.
  const bullets = [...quotaBullets(plan), ...plan.features];

  return (
    <div
      className={
        emphasized
          ? "rounded-lg border border-brand-300 bg-brand-50/30 p-4 ring-2 ring-brand-500/15"
          : isFree
            ? "rounded-lg border border-neutral-200 bg-neutral-50 p-4"
            : "rounded-lg border border-neutral-200 bg-white p-4"
      }
    >
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-neutral-900">{plan.name}</h3>
        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
      </div>
      <p className="mt-1 font-display text-xl font-semibold text-neutral-900">
        {priceLabel}
        {periodLabel && (
          <span className="text-sm font-normal text-neutral-600">
            {periodLabel}
          </span>
        )}
      </p>
      {plan.description && (
        <p className="mt-1 text-xs text-neutral-500">{plan.description}</p>
      )}
      <ul className="mt-3 flex flex-col gap-1.5 text-sm text-neutral-700">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <Check
              className={
                emphasized
                  ? "mt-0.5 size-3.5 shrink-0 text-brand-600"
                  : "mt-0.5 size-3.5 shrink-0 text-neutral-400"
              }
              aria-hidden
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
