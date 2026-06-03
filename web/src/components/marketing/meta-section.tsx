import Link from "next/link";
import {
  Target,
  ShieldCheck,
  RefreshCcw,
  TrendingUp,
  Radar,
  ArrowRight,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { MetaAdMockup } from "@/components/marketing/meta-ad-mockup";

const benefits = [
  {
    icon: Radar,
    title: "Retargeting otomatis",
    description:
      "Pengunjung yang lihat produk tapi belum checkout otomatis “dikejar” iklan produk yang sama di feed Facebook & Instagram mereka.",
  },
  {
    icon: ShieldCheck,
    title: "Tracking server-side (CAPI)",
    description:
      "Tetap akurat walau pembeli pakai iOS atau ad-blocker. Konversi dilaporkan langsung dari server kami di titik “lunas”, bukan dari browser yang gampang hilang.",
  },
  {
    icon: RefreshCcw,
    title: "Katalog produk auto-sync",
    description:
      "Semua produkmu jadi katalog di Meta Commerce Manager tanpa upload manual — siap dipakai Advantage+ Catalog Ads & Shopping di Instagram.",
  },
  {
    icon: TrendingUp,
    title: "ROAS yang terukur",
    description:
      "Meta belajar dari data transaksi asli, bukan tebak-tebakan. Kamu tahu persis iklan mana yang menghasilkan penjualan — tiap rupiah iklan makin efektif.",
  },
];

export function MetaSection() {
  return (
    <Section bg="brand-soft">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: copy + benefits */}
          <div className="flex flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-soft">
              <Target className="size-3.5" aria-hidden />
              BARU · Iklan Meta (Facebook &amp; Instagram)
            </span>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Stop bakar budget iklan ke{" "}
              <span className="text-gradient-brand">orang yang salah.</span>
            </h2>
            <p className="mt-4 text-lg text-neutral-700">
              Hubungkan Meta Pixel sekali, dan tiap langkah pembeli — dari lihat
              produk sampai bayar lunas — kebaca otomatis. Katalog tokomu pun
              langsung tersinkron ke Meta. Hasilnya: iklan yang dioptimalkan ke
              orang yang benar-benar belanja.
            </p>

            <ul className="mt-8 flex flex-col gap-5">
              {benefits.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-soft ring-1 ring-brand-200">
                    <Icon className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/login" className="shrink-0">
                <Button size="lg" className="whitespace-nowrap">
                  Hubungkan Meta Pixel
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <p className="text-xs text-neutral-500">
                Tersedia di plan Pro &amp; Bisnis · Setup &lt;5 menit
              </p>
            </div>
          </div>

          {/* Right: Instagram/Facebook sponsored-post mockup (rotates per refresh) */}
          <MetaAdMockup />
        </div>
      </Container>
    </Section>
  );
}
