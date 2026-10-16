"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";
import { formatRupiahShort } from "@/lib/format";
import { quotaBullets } from "@/lib/plan-bullets";
import type { PublicPlan } from "@/lib/types";

type Period = "monthly" | "yearly";

type Props = {
  plans: PublicPlan[];
};

export function Pricing({ plans }: Props) {
  const [period, setPeriod] = useState<Period>("monthly");

  // Pre-compute discount percent (yearly vs monthly) of the most
  // popular paid plan so the toggle's "−20%" badge stays in sync with
  // whatever admin sets in the plans table.
  const yearlyDiscountLabel = useMemo(() => {
    const pro = plans.find((p) => p.tier === "pro");
    if (!pro || pro.monthly_price_cents === 0) return null;
    const pct =
      ((pro.monthly_price_cents - pro.yearly_price_cents) /
        pro.monthly_price_cents) *
      100;
    if (pct <= 0) return null;
    return `−${Math.round(pct)}%`;
  }, [plans]);

  return (
    <section id="harga" className="scroll-mt-20 py-12 lg:py-16">
      <Container>
        {/* Heading left, period toggle right — the same header shape the rest
            of the page uses, instead of a centred eyebrow pill. */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
              Bayar tetap per bulan, tanpa potongan per pesanan
            </h2>
            <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-neutral-600">
              Jualan 1 pesanan atau 1.000 pesanan, biaya kami tidak naik.
              {yearlyDiscountLabel && (
                <>
                  {" "}
                  Hemat {yearlyDiscountLabel.replace("−", "")} kalau pilih
                  tahunan.
                </>
              )}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Periode pembayaran"
            className="inline-flex shrink-0 rounded-full border border-neutral-200 bg-white p-1"
          >
            {(["monthly", "yearly"] as const).map((p) => (
              <button
                key={p}
                role="tab"
                type="button"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                  period === p
                    ? "bg-brand-600 text-white"
                    : "text-neutral-600 hover:text-neutral-900",
                )}
              >
                {p === "monthly" ? "Bulanan" : "Tahunan"}
                {p === "yearly" && yearlyDiscountLabel && (
                  <span
                    className={cn(
                      "ml-1.5 text-xs",
                      period === "yearly" ? "text-white/75" : "text-brand-700",
                    )}
                  >
                    {yearlyDiscountLabel}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3.5 lg:grid-cols-3">
          {plans.map((plan) => {
            const cents =
              period === "monthly"
                ? plan.monthly_price_cents
                : plan.yearly_price_cents;
            const isFree = plan.tier === "free";
            const priceLabel = isFree ? "Rp 0" : formatRupiahShort(cents);
            const periodLabel =
              period === "monthly"
                ? plan.period_monthly_label
                : plan.period_yearly_label;

            return (
              <div
                key={plan.tier}
                className={cn(
                  "relative flex h-full flex-col overflow-hidden rounded-3xl p-6 sm:p-7",
                  plan.highlighted
                    ? "bg-brand-50 ring-1 ring-brand-200"
                    : "border border-neutral-200 bg-white",
                )}
              >
                {plan.highlighted && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-soft-dots opacity-60"
                    style={
                      {
                        "--pattern-color": "oklch(0.45 0 0 / 0.07)",
                      } as React.CSSProperties
                    }
                  />
                )}

                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg font-bold text-neutral-900">
                      {plan.name}
                    </h3>
                    {plan.highlighted && (
                      <span className="rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                        Paling populer
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    {plan.description}
                  </p>

                  <p className="mt-6 whitespace-nowrap font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-neutral-900">
                    {priceLabel}
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">{periodLabel}</p>

                  <ul className="mb-7 mt-6 flex flex-col gap-2.5 text-sm text-neutral-700">
                    {[...quotaBullets(plan), ...plan.features].map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-brand-600"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/login"
                    className={cn(
                      "mt-auto inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-bold transition-colors",
                      plan.highlighted
                        ? "bg-brand-600 text-white hover:bg-brand-700"
                        : "border border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400",
                    )}
                  >
                    {plan.cta_label}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
