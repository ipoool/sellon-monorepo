import Link from "next/link";
import {
  ShoppingCart,
  Banknote,
  QrCode,
  ArrowLeftRight,
  Users,
  Receipt,
  RefreshCcw,
  Zap,
  Plus,
  Sparkles,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: RefreshCcw,
    title: "Stok auto-sinkron",
    description:
      "Laku di kasir? Stok di katalog online ikut turun seketika. Gak akan kejadian double-jual lagi.",
  },
  {
    icon: ArrowLeftRight,
    title: "Bayar campur boleh",
    description:
      "Tunai Rp 30rb + QRIS Rp 20rb dalam satu nota. Split payment built-in, kembalian auto-hitung.",
  },
  {
    icon: Users,
    title: "Multi-kasir tanpa ribet",
    description:
      "Dua staff jaga toko? Mereka bisa buka shift sendiri-sendiri. Rekap kas tiap akhir shift otomatis.",
  },
  {
    icon: Receipt,
    title: "Struk: thermal + WhatsApp",
    description:
      "Print 58mm di printer kasir atau kirim langsung ke WA pembeli. Pelanggan suka, kamu hemat kertas.",
  },
];

export function PosSection() {
  return (
    <Section bg="brand-soft">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: copy + benefits */}
          <div className="flex flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-soft">
              <Zap className="size-3.5" aria-hidden />
              BARU · Mode Kasir POS
            </span>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Toko online + toko fisik.{" "}
              <span className="text-gradient-brand">Satu dashboard.</span> Nol
              pusing.
            </h2>
            <p className="mt-4 text-lg text-neutral-700">
              Pembeli walk-in bayar di laci, pembeli online bayar QRIS — semua
              tercatat di tempat yang sama. Stok, omzet, dan poin loyalty
              otomatis nyambung.
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
              <Link href="/login">
                <Button size="lg">
                  Buka Kasirmu Hari Ini
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <p className="text-xs text-neutral-500">
                Tersedia di plan Bisnis · Setup &lt;5 menit
              </p>
            </div>
          </div>

          {/* Right: POS UI mockup */}
          <div className="relative">
            {/* Floating "Stok auto-update" tag */}
            <div className="pointer-events-none absolute -left-4 top-6 z-20 hidden rotate-[-4deg] items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-elevated sm:inline-flex">
              <RefreshCcw className="size-3" aria-hidden />
              Stok sinkron real-time
            </div>
            {/* Floating "QRIS + Cash" tag */}
            <div className="pointer-events-none absolute -right-3 bottom-20 z-20 hidden rotate-[3deg] items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-elevated sm:inline-flex">
              <Banknote className="size-3" aria-hidden />
              Split payment
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-popout">
              {/* Mock POS header */}
              <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart
                    className="size-4 text-brand-700"
                    aria-hidden
                  />
                  <span className="text-sm font-semibold text-neutral-900">
                    Transaksi (3)
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  Shift Aktif
                </span>
              </div>

              {/* Mock items */}
              <ul className="flex flex-col gap-2 p-3">
                {[
                  { name: "Kopi Susu Gula Aren", qty: 2, price: 18000 },
                  { name: "Croissant Coklat", qty: 1, price: 22000 },
                  { name: "Es Teh Lemon", qty: 1, price: 12000 },
                ].map((it) => (
                  <li
                    key={it.name}
                    className="flex items-center gap-3 rounded-lg bg-neutral-50 p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {it.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Rp {it.price.toLocaleString("id-ID")} × {it.qty}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="flex size-6 items-center justify-center rounded border border-neutral-200 bg-white text-neutral-400" aria-hidden>
                        <Plus className="size-3 rotate-45" />
                      </button>
                      <span className="w-5 text-center text-xs font-semibold">
                        {it.qty}
                      </span>
                      <button className="flex size-6 items-center justify-center rounded border border-neutral-200 bg-white text-neutral-400" aria-hidden>
                        <Plus className="size-3" />
                      </button>
                    </div>
                    <Trash2
                      className="size-3.5 text-neutral-300"
                      aria-hidden
                    />
                  </li>
                ))}
              </ul>

              {/* Loyalty badge */}
              <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1.5">
                <Sparkles
                  className="size-3.5 text-brand-700"
                  aria-hidden
                />
                <p className="flex-1 text-xs text-brand-800">
                  <strong>Andi W.</strong> · 240 poin tersedia
                </p>
                <span className="text-[10px] font-medium text-brand-700">
                  +7 poin
                </span>
              </div>

              {/* Summary */}
              <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-3 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span>Rp 70.000</span>
                </div>
                <div className="flex justify-between text-brand-700">
                  <span>Diskon volume</span>
                  <span>−Rp 5.000</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-base font-bold text-neutral-900">
                  <span>TOTAL</span>
                  <span>Rp 65.000</span>
                </div>
              </div>

              {/* Payment method chips */}
              <div className="flex gap-2 border-t border-neutral-100 px-4 py-3">
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 py-2 text-xs font-semibold text-brand-700">
                  <Banknote className="size-3.5" aria-hidden />
                  Tunai
                </div>
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white py-2 text-xs font-medium text-neutral-600">
                  <QrCode className="size-3.5" aria-hidden />
                  QRIS
                </div>
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white py-2 text-xs font-medium text-neutral-600">
                  <ArrowLeftRight className="size-3.5" aria-hidden />
                  Split
                </div>
              </div>

              {/* Pay button */}
              <div className="border-t border-neutral-100 bg-white p-3">
                <div className="rounded-lg bg-brand-700 px-4 py-3 text-center text-sm font-bold text-white shadow-soft">
                  Bayar Rp 65.000
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
