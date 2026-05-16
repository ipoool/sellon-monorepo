"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Slide = { image_url: string };

type Props = {
  storeSlug: string;
  slides: Slide[];
  slideDurationMs?: number;
  ctaLabel?: string;
  onDismiss?: () => void;
};

const DEFAULT_autoplayMs = 3000;
const SWIPE_THRESHOLD = 50;

export function KioskSplash({ storeSlug, slides, slideDurationMs, ctaLabel, onDismiss }: Props) {
  const autoplayMs = slideDurationMs ?? DEFAULT_autoplayMs;
  const storageKey = `${storeSlug}:kiosk-splash-dismissed`;

  // Parent (StorefrontCatalog) owns the sessionStorage check and only renders
  // this component when the splash should actually show. We just track local
  // dismiss for instant visual feedback while the parent catches up.
  const [dismissed, setDismissed] = useState(false);
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (dismissed || slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, autoplayMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [dismissed, slides.length, autoplayMs]);

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, autoplayMs);
  }

  function prev() {
    setCurrent((c) => (c - 1 + slides.length) % slides.length);
    resetTimer();
  }

  function next() {
    setCurrent((c) => (c + 1) % slides.length);
    resetTimer();
  }

  function dismiss() {
    sessionStorage.setItem(storageKey, "1");
    setDismissed(true);
    onDismiss?.();
    requestAnimationFrame(() => {
      document.getElementById("produk")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) next();
    else prev();
  }

  if (dismissed || slides.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Banner promo toko"
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Slide strip — all slides laid out side-by-side, translated on current change */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-500 ease-in-out will-change-transform"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {slides.map((s, i) => (
            <div key={i} className="relative h-full w-full shrink-0">
              <Image
                src={s.image_url}
                alt={`Slide ${i + 1}`}
                fill
                sizes="100vw"
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}
        </div>
        {/* Gradient overlay at bottom for readability */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 to-transparent"
        />
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-10 pt-4">
        {/* Dots indicator */}
        {slides.length > 1 && (
          <div className="flex items-center gap-2" aria-hidden>
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setCurrent(i);
                  resetTimer();
                }}
                className={
                  i === current
                    ? "size-2.5 rounded-full bg-white transition-all"
                    : "size-1.5 rounded-full bg-white/50 transition-all hover:bg-white/75"
                }
              />
            ))}
          </div>
        )}

        {/* CTA button */}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full bg-brand-500 px-10 py-4 text-lg font-bold text-white shadow-elevated transition-colors hover:bg-brand-600 active:bg-brand-700"
        >
          {ctaLabel?.trim() || "Order Now"}
        </button>
      </div>
    </div>
  );
}
