import { Bell, Check } from "lucide-react";

import { Container } from "@/components/layout/container";
import { FeatureArt } from "./feature-art";

// Deliberately no notify form: outbound email for sellon.id is suspended, so
// a "kami kabari lewat email" promise is one the product cannot keep today.
const PLANNED = [
  "Notifikasi pesanan masuk langsung di HP",
  "Kasir dan scan barcode tanpa buka browser",
  "Cek omzet dan stok dari mana saja",
];

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
      <path d="M3.6 1.81 13.79 12 3.6 22.19a2 2 0 0 1-.6-1.44V3.25c0-.57.23-1.08.6-1.44Z" fill="#00D2FF" />
      <path d="M16.8 9 3.6 1.81 13.79 12 16.8 9Z" fill="#00F076" />
      <path d="m20.16 10.86-3.36-1.86L13.79 12l3.01 3 3.36-1.86c1.12-.64 1.12-2.64 0-3.28Z" fill="#FFCE00" />
      <path d="M3.6 22.19 16.8 15l-3.01-3L3.6 22.19Z" fill="#FF3A44" />
    </svg>
  );
}

/**
 * Store buttons for an app that is not released yet.
 *
 * They are spans, not links or buttons: there is nothing to download, and a
 * badge that looks tappable but goes nowhere is worse than one that plainly
 * says "segera". The familiar badge shape is what makes the promise legible.
 */
function StoreBadge({
  mark,
  top,
  name,
}: {
  mark: React.ReactNode;
  top: string;
  name: string;
}) {
  return (
    <span className="inline-flex cursor-default items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2.5 text-white opacity-90">
      {mark}
      <span className="text-left leading-tight">
        <span className="block text-[9px] font-medium uppercase tracking-[0.1em] text-white/60">
          {top}
        </span>
        <span className="block text-[15px] font-semibold">{name}</span>
      </span>
    </span>
  );
}

export function MobileApp() {
  return (
    <section className="py-12 lg:py-16">
      <Container>
        <div className="relative grid items-center gap-10 overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-50 px-6 py-10 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-soft-grid opacity-60"
            style={{ "--pattern-color": "oklch(0.45 0 0 / 0.05)" } as React.CSSProperties}
          />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-warning">
              <Bell className="size-3.5" aria-hidden />
              Segera hadir
            </span>
            <h2 className="mt-4 max-w-[20ch] font-display text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-neutral-900 sm:text-3xl">
              Aplikasi SellOn untuk HP sedang dikerjakan.
            </h2>
            <p className="mt-3 max-w-[50ch] text-[15px] leading-relaxed text-neutral-600">
              Sambil menunggu, semuanya sudah bisa kamu jalankan sekarang lewat
              browser HP — tanpa install apa pun, dan pembelimu juga tidak perlu
              install.
            </p>

            <ul className="mt-6 grid gap-2.5">
              {PLANNED.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-neutral-700"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-brand-600"
                    aria-hidden
                  />
                  {p}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <StoreBadge mark={<AppleMark />} top="Segera di" name="App Store" />
              <StoreBadge mark={<PlayMark />} top="Segera di" name="Google Play" />
            </div>
          </div>

          <FeatureArt
            name="mobile-app"
            className="relative mx-auto h-auto w-full max-w-[300px]"
          />
        </div>
      </Container>
    </section>
  );
}
