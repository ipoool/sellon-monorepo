"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Cookie, X } from "lucide-react";

export const CONSENT_KEY = "sellon:cookie-consent";
// Same-tab notification: `storage` only fires in OTHER tabs, so the banner
// dispatches this to let the pixel gate react immediately.
const CONSENT_EVENT = "sellon:cookie-consent-change";

export type ConsentValue = "accepted" | "declined" | null;

export function readConsent(): ConsentValue {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    // localStorage blocked (private mode, etc.) — treat as "no consent".
    return null;
  }
}

export function writeConsent(value: Exclude<ConsentValue, null>) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // ignore — the in-memory notification below still gates this page view.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  // `storage` fires in the OTHER tabs — keeps a second tab in sync.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Reactive read of the stored consent. The server snapshot is null (there is no
// localStorage there), so anything gated on "accepted" stays unmounted through
// hydration and only appears once the real value is read — no hydration gap.
export function useConsent(): ConsentValue {
  return useSyncExternalStore(subscribeConsent, readConsent, () => null);
}

type Props = {
  // True when the store runs a Meta Pixel — the banner then has to disclose
  // the analytics/ads cookies instead of claiming nothing is shared.
  hasAnalytics?: boolean;
};

export function CookieConsent({ hasAnalytics = false }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readConsent() === null) {
      // Small delay so it doesn't pop instantly on page load.
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function accept() {
    persist("accepted");
  }

  function decline() {
    persist("declined");
  }

  function persist(value: "accepted" | "declined") {
    writeConsent(value);
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
            {hasAnalytics ? (
              <>
                Keranjang belanja dan preferensi kamu disimpan di perangkat ini.
                Toko ini juga memakai cookie analitik &amp; iklan (Meta Pixel)
                yang mengirim data kunjungan ke Meta. Klik &ldquo;Tolak&rdquo;
                kalau kamu tidak mau — belanja tetap bisa jalan.
              </>
            ) : (
              <>
                Untuk menyimpan keranjang belanja dan preferensi kamu selama
                sesi ini. Tidak ada data yang dibagikan ke pihak ketiga.
              </>
            )}
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
