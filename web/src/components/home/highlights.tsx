import Link from "next/link";
import { ArrowRight, Wallet, Layers, WifiOff } from "lucide-react";

import { Container } from "@/components/layout/container";

/**
 * The three arguments that are structurally true of SellOn and structurally
 * hard for a marketplace to answer. Everything else on this page is a
 * feature; these are the position — so each point leads with the figure, not
 * the prose, on a soft patterned ground that sets the band apart without
 * going dark.
 *
 * Every figure here is a fact, not a claim: Rp 0 is the real take-rate on
 * every tier, one account really does drive storefront + POS off one stock
 * number, and the POS really does sell with no connection. No competitor's
 * fee percentage is quoted, because we have not verified one.
 */
const POINTS = [
  {
    icon: Wallet,
    figure: "Rp 0",
    label: "potongan per pesanan",
    title: "Uangnya masuk ke rekeningmu.",
    body: "Kamu pakai akun Midtrans sendiri, jadi dana pembeli tidak pernah mampir ke kami — dan tidak ada potongan yang dihitung dari tiap penjualan. Yang kamu bayar cuma langganan bulanan yang angkanya tetap.",
  },
  {
    icon: Layers,
    figure: "1",
    label: "akun untuk online & offline",
    title: "Satu stok, bukan dua pembukuan.",
    body: "Toko online, kasir, QR meja, dan dapur membaca katalog yang sama. Terjual di konter, stok di toko online ikut berkurang detik itu juga.",
  },
  {
    icon: WifiOff,
    figure: "0",
    label: "bar sinyal pun tetap jualan",
    title: "Internet mati, kasir jalan terus.",
    body: "Transaksi tersimpan di perangkat dan tersinkron sendiri begitu sinyal kembali — dengan pengaman supaya satu pesanan tidak pernah tercatat dua kali.",
  },
];

export function Highlights() {
  return (
    <section className="my-12 lg:my-16">
      <Container>
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-brand-soft px-6 py-10 sm:px-10 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-soft-dots opacity-70"
          />
          <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
            Yang bikin beda
          </p>
          <h2 className="mt-3 max-w-[22ch] font-display text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-neutral-900 sm:text-4xl">
            Tiga hal yang marketplace tidak bisa tiru.
          </h2>

          <ul className="mt-9 grid gap-3.5 lg:grid-cols-3">
            {POINTS.map(({ icon: Icon, figure, label, title, body }) => (
              <li
                key={title}
                className="rounded-2xl bg-white/80 p-6 shadow-soft backdrop-blur-[2px] sm:p-7"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand-500">
                  <Icon className="size-5 text-white" aria-hidden />
                </span>
                <p className="mt-5 font-display text-[44px] font-bold leading-none tracking-[-0.03em] text-brand-700 sm:text-[52px]">
                  {figure}
                </p>
                <p className="mt-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-brand-700/70">
                  {label}
                </p>
                <h3 className="mt-5 text-base font-bold leading-snug text-neutral-900">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {body}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700"
            >
              Buka Toko Gratis
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="#harga"
              className="inline-flex items-center rounded-full border border-brand-300 bg-white/70 px-5 py-3 text-sm font-bold text-brand-700 transition-colors hover:bg-white"
            >
              Lihat Harga
            </Link>
          </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
