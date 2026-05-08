"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Period = "monthly" | "yearly";

type Tier = {
  name: string;
  price: { monthly: string; yearly: string };
  period: { monthly: string; yearly: string };
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Gratis",
    price: { monthly: "Rp 0", yearly: "Rp 0" },
    period: { monthly: "selamanya", yearly: "selamanya" },
    description: "Cukup untuk warung dan toko kecil yang baru mulai online.",
    features: [
      "Sampai 30 produk",
      "Pembayaran QRIS",
      "1 staf admin",
      "Laporan dasar",
    ],
    cta: "Mulai Gratis",
    href: "/masuk",
  },
  {
    name: "Pro",
    price: { monthly: "Rp 99rb", yearly: "Rp 79rb" },
    period: { monthly: "/ bulan", yearly: "/ bulan, ditagih tahunan" },
    description: "Untuk toko yang sudah punya pelanggan tetap.",
    features: [
      "Produk tanpa batas",
      "Otomasi WhatsApp",
      "5 staf admin",
      "Integrasi kurir",
      "Laporan lengkap",
    ],
    cta: "Coba 14 Hari Gratis",
    href: "/masuk",
    highlighted: true,
  },
  {
    name: "Bisnis",
    price: { monthly: "Rp 299rb", yearly: "Rp 239rb" },
    period: { monthly: "/ bulan", yearly: "/ bulan, ditagih tahunan" },
    description: "Untuk brand yang scale ke multi-cabang dan multi-channel.",
    features: [
      "Semua fitur Pro",
      "Multi-cabang",
      "Staf tanpa batas",
      "API & webhook",
      "Priority support",
    ],
    cta: "Hubungi Sales",
    href: "/masuk",
  },
];

export function Pricing() {
  const [period, setPeriod] = useState<Period>("monthly");

  return (
    <Section id="harga">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-brand-600">Harga</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Bayar bulanan tetap, tanpa take-rate per pesanan
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Mau jualan 1 atau 1.000 pesanan, biaya kami tidak naik. Hemat 20%
            kalau bayar tahunan.
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
              <span
                className={cn(
                  "ml-1.5 text-xs",
                  period === "yearly" ? "text-success" : "text-success",
                )}
              >
                −20%
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              variant={tier.highlighted ? "ringed" : "default"}
              className={cn(
                "relative flex flex-col gap-6",
                tier.highlighted && "lg:scale-[1.02]",
              )}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="brand" className="shadow-soft">
                    Paling populer
                  </Badge>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-neutral-900">
                  {tier.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {tier.description}
                </p>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold tracking-tight text-neutral-900">
                  {tier.price[period]}
                </span>
                <span className="text-sm text-neutral-500">
                  {tier.period[period]}
                </span>
              </div>

              <ul className="flex flex-col gap-2.5 text-sm text-neutral-700">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link href={tier.href} className="mt-auto">
                <Button
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                  size="md"
                >
                  {tier.cta}
                </Button>
              </Link>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-neutral-500">
          Semua paket sudah termasuk SSL, hosting, dan update fitur. Pajak akan
          dihitung saat checkout.
        </p>
      </Container>
    </Section>
  );
}
