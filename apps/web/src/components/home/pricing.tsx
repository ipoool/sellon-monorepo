import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

type Tier = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Gratis",
    price: "Rp 0",
    period: "selamanya",
    description: "Cukup untuk warung dan toko kecil yang baru mulai online.",
    features: [
      "Sampai 30 produk",
      "Pembayaran QRIS",
      "1 staf admin",
      "Laporan dasar",
    ],
    cta: "Mulai Gratis",
    href: "/dasbor",
  },
  {
    name: "Pro",
    price: "Rp 99rb",
    period: "/ bulan",
    description: "Untuk toko yang sudah punya pelanggan tetap.",
    features: [
      "Produk tanpa batas",
      "Otomasi WhatsApp",
      "5 staf admin",
      "Integrasi kurir",
      "Laporan lengkap",
    ],
    cta: "Coba 14 Hari",
    href: "/dasbor",
    highlighted: true,
  },
  {
    name: "Bisnis",
    price: "Rp 299rb",
    period: "/ bulan",
    description: "Untuk brand yang scale ke multi-cabang dan multi-channel.",
    features: [
      "Semua fitur Pro",
      "Multi-cabang",
      "Staf tanpa batas",
      "API & webhook",
      "Priority support",
    ],
    cta: "Hubungi Sales",
    href: "/dasbor",
  },
];

export function Pricing() {
  return (
    <section id="harga" className="scroll-mt-20 py-20 lg:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Harga sederhana, tanpa take-rate per pesanan
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Bayar bulanan tetap. Mau jualan 1 atau 1.000 pesanan, biaya kami tidak naik.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={cn(
                "flex flex-col gap-6",
                tier.highlighted && "border-brand-500 ring-2 ring-brand-500/20",
              )}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-neutral-900">
                    {tier.name}
                  </h3>
                  {tier.highlighted && (
                    <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Paling populer
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  {tier.description}
                </p>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold tracking-tight text-neutral-900">
                  {tier.price}
                </span>
                <span className="text-sm text-neutral-500">{tier.period}</span>
              </div>

              <ul className="flex flex-col gap-2 text-sm text-neutral-700">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span aria-hidden className="mt-1 text-brand-600">
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link href={tier.href} className="mt-auto">
                <Button
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  {tier.cta}
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
