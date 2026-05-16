"use client";

import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";

const CONSENT_KEY = "sellon:cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) {
        // Small delay so it doesn't pop instantly on page load.
        const t = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage blocked (private mode, etc.) — stay hidden.
    }
  }, []);

  function accept() {
    persist("accepted");
  }

  function decline() {
    persist("declined");
  }

  function persist(value: "accepted" | "declined") {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Persetujuan cookie"
      className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-elevated"
    >
      <button
        type="button"
        onClick={decline}
        aria-label="Tutup"
        className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        <X className="size-3.5" aria-hidden />
      </button>

      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Cookie className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">
            Kami menggunakan cookies
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600">
            Untuk menyimpan keranjang belanja dan preferensi kamu selama sesi
            ini. Tidak ada data yang dibagikan ke pihak ketiga.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={decline}
          className="flex h-8 flex-1 items-center justify-center rounded-lg border border-neutral-200 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Tolak
        </button>
        <button
          type="button"
          onClick={accept}
          className="flex h-8 flex-1 items-center justify-center rounded-lg bg-brand-600 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Terima
        </button>
      </div>
    </div>
  );
}
