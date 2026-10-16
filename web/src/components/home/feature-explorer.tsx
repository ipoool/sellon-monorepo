"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Container } from "@/components/layout/container";
import { HOME_FEATURES } from "@/lib/home-features";
import { FeatureArt } from "./feature-art";

/**
 * One explorer that replaces six full-height feature sections.
 *
 * Those sections were visually identical — eyebrow, heading, checklist,
 * screenshot — so the page read as one shape repeated nine times and nothing
 * looked more important than anything else. Here the six live in one place and
 * only the chosen one is expanded, which is what takes the page from ~13,000px
 * to something a visitor reaches the end of.
 *
 * The hero's entry chips link to `#fitur-<key>`, so this listens to the hash:
 * a chip click lands the visitor on the panel that explains exactly the thing
 * the chip named. Because the anchor is this section, the browser scrolls here
 * on its own and we only have to switch the panel.
 */
export function FeatureExplorer() {
  const [active, setActive] = useState(HOME_FEATURES[0].key);

  useEffect(() => {
    const syncFromHash = () => {
      const key = window.location.hash.replace(/^#fitur-?/, "");
      if (HOME_FEATURES.some((f) => f.key === key)) setActive(key);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const feature = HOME_FEATURES.find((f) => f.key === active) ?? HOME_FEATURES[0];
  const Icon = feature.icon;

  return (
    <section id="fitur" className="scroll-mt-20 py-12 lg:py-16">
      <Container>
        <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
          Semua yang bisa kamu jalankan dari satu akun
        </h2>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-neutral-600">
          Pilih yang paling dekat dengan usahamu sekarang. Sisanya tinggal kamu
          nyalakan kalau sudah butuh.
        </p>

        {/* Tabs. Horizontal scroll on phones so six never squeeze. The active
            tab wears the same wash as the panel it opens, so the two read as
            one surface instead of a black pill floating above a green card. */}
        <div
          role="tablist"
          aria-label="Area produk"
          className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {HOME_FEATURES.map((f) => {
            const TabIcon = f.icon;
            const on = f.key === feature.key;
            return (
              <button
                key={f.key}
                id={`fitur-${f.key}`}
                role="tab"
                type="button"
                aria-selected={on}
                aria-controls="panel-fitur"
                onClick={() => setActive(f.key)}
                className={`inline-flex shrink-0 scroll-mt-28 items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-bold transition-colors ${
                  on
                    ? `border-current/35 ${f.tint} ${f.accent}`
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
                }`}
              >
                <TabIcon className="size-4" aria-hidden />
                <span className={on ? "text-neutral-900" : undefined}>
                  {f.label}
                </span>
              </button>
            );
          })}
        </div>

        <div
          id="panel-fitur"
          role="tabpanel"
          aria-labelledby={`fitur-${feature.key}`}
          className={`relative mt-4 overflow-hidden rounded-3xl ${feature.tint}`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-soft-dots opacity-60"
            style={{ "--pattern-color": "oklch(0.45 0 0 / 0.07)" } as React.CSSProperties}
          />
          <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-10">
            <div>
              <span
                className={`grid size-11 place-items-center rounded-2xl ${feature.chip}`}
              >
                <Icon className="size-[22px] text-white" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold leading-snug tracking-[-0.01em] text-neutral-900 sm:text-2xl">
                {feature.headline}
              </h3>
              <p className="mt-2.5 max-w-[48ch] text-[15px] leading-relaxed text-neutral-600">
                {feature.body}
              </p>

              <ul className="mt-5 grid gap-2.5">
                {feature.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-neutral-700"
                  >
                    <Check
                      className={`mt-0.5 size-4 shrink-0 ${feature.accent}`}
                      aria-hidden
                    />
                    {p}
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700"
              >
                Coba {feature.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>

            <FeatureArt
              name={feature.key}
              className="mx-auto h-auto w-full max-w-[380px]"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
