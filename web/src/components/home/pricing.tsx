"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Section id="harga">
      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-medium text-brand-600">Harga</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Bayar tetap per bulan, tanpa potongan per pesanan
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Jualan 1 pesanan atau 1.000 pesanan, biaya kami tidak naik.
            {yearlyDiscountLabel && (
              <> Hemat {yearlyDiscountLabel.replace("−", "")} kalau pilih tahunan.</>
            )}
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div
            role="tablist"
            aria-label="Periode pembayaran"
            className="inline-flex rounded-full border border-neutral-200 bg-white p-1 shadow-soft"
          >
            <button
              role="tab"
              aria-selected={period === "monthly"}
              onClick={() => setPeriod("monthly")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                period === "monthly"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:text-neutral-900",
              )}
            >
              Bulanan
            </button>
            <button
              role="tab"
              aria-selected={period === "yearly"}
              onClick={() => setPeriod("yearly")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                period === "yearly"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:text-neutral-900",
              )}
            >
              Tahunan
              {yearlyDiscountLabel && (
                <span className="ml-1.5 text-xs text-success">
                  {yearlyDiscountLabel}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
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
              <Card
                key={plan.tier}
                variant={plan.highlighted ? "ringed" : "default"}
                className={cn(
                  "relative flex flex-col gap-6",
                  plan.highlighted && "lg:scale-[1.02]",
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="brand" className="shadow-soft">
                      Paling populer
                    </Badge>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">
                    {plan.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    {plan.description}
                  </p>
                </div>

                <div className="flex flex-col">
                  <span className="font-display text-4xl font-semibold leading-none tracking-tight text-neutral-900 whitespace-nowrap">
                    {priceLabel}
                  </span>
                  <span className="mt-2 text-sm text-neutral-500">
                    {periodLabel}
                  </span>
                </div>

                <ul className="flex flex-col gap-2.5 text-sm text-neutral-700">
                  {[...quotaBullets(plan), ...plan.features].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                        <Check className="size-3" strokeWidth={3} aria-hidden />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/login" className="mt-auto">
                  <Button
                    variant={plan.highlighted ? "default" : "outline"}
                    className="w-full"
                    size="md"
                  >
                    {plan.cta_label}
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
