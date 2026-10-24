"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/components/dashboard/plan-context";
import { formatRupiah } from "@/lib/format";
import type { GatedFeature } from "@/lib/types";

type GateCtx = {
  /** Whether the store can use this feature right now. */
  has: (f: GatedFeature) => boolean;
  /** Open the lock dialog for a feature, naming the package that unlocks it. */
  openGate: (feature: GatedFeature, label?: string) => void;
};

const Ctx = createContext<GateCtx>({ has: () => false, openGate: () => {} });

/**
 * Gating for nav items and tabs that stay VISIBLE but, when a seller
 * without the feature clicks them, explain what to buy instead of
 * navigating.
 *
 * This used to be one `locked` boolean meaning "below Bisnis". That was
 * right while a tier decided everything; now the answer differs per
 * feature, and the dialog has to name the package — offering someone the
 * Rp 99.000 kasir beats pushing them at the whole bundle.
 */
export function useBisnisGate(): GateCtx {
  return useContext(Ctx);
}

export function BisnisGateProvider({ children }: { children: ReactNode }) {
  const { plan, features, catalog } = useEntitlements();
  const [open, setOpen] = useState<{ feature: GatedFeature; label: string } | null>(
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  const has = (f: GatedFeature) => features.includes(f);
  const openGate = (feature: GatedFeature, label?: string) =>
    setOpen({ feature, label: label || "Fitur ini" });
  const close = () => setOpen(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d) close();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  // Which package sells this feature. Read from the API's catalogue rather
  // than a map kept here, so the two can never disagree about what is in
  // which package.
  const pack = open ? catalog.find((a) => a.features.includes(open.feature)) : undefined;
  // Add-ons sit on top of Pro, so a free seller needs the plan first.
  const needsPro = plan === "free";

  return (
    <Ctx.Provider value={{ has, openGate }}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="feature-gate-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-0 text-left shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
      >
        {/* Body only while there is a subject. The <dialog> itself stays
            mounted for showModal(), but rendering its contents with
            `open === null` put the literal text "undefined belum aktif"
            into the DOM of every dashboard page. */}
        {open && (
        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <button
            type="button"
            onClick={close}
            aria-label="Tutup"
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4" aria-hidden />
          </button>
          <div className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Sparkles className="size-7" aria-hidden />
          </div>

          <h2
            id="feature-gate-title"
            className="mt-4 font-display text-lg font-semibold text-neutral-900"
          >
            {pack ? `${open.label} ada di ${pack.name}` : `${open.label} belum aktif`}
          </h2>

          {pack ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {needsPro ? (
                  <>
                    Paket tambahan bisa diaktifkan setelah kamu berlangganan
                    Pro. Setelah itu {pack.name} cuma{" "}
                    <strong className="text-neutral-900">
                      {formatRupiah(pack.monthly_price_cents)}
                    </strong>
                    /bulan — bayar yang dipakai saja.
                  </>
                ) : (
                  <>
                    Aktifkan {pack.name} seharga{" "}
                    <strong className="text-neutral-900">
                      {formatRupiah(pack.monthly_price_cents)}
                    </strong>
                    /bulan. Langsung bisa dipakai, dan tagihannya baru masuk
                    saat perpanjangan berikutnya.
                  </>
                )}
              </p>
              {/* What else comes in the box, so the price has context. */}
              <ul className="mt-4 flex w-full flex-col gap-1.5 rounded-lg bg-neutral-50 p-3 text-left">
                {pack.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-neutral-700"
                  >
                    <Check className="size-4 shrink-0 text-brand-600" aria-hidden />
                    {FEATURE_LABELS[f] ?? f}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Fitur ini tersedia di paket Pro. Upgrade sekarang untuk
              membukanya — datamu yang sudah ada tetap aman.
            </p>
          )}

          <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild size="md" className="w-full sm:w-auto">
              <Link href="/settings/subscription" onClick={close}>
                {needsPro || !pack ? "Lihat paket" : `Aktifkan ${pack.name}`}
              </Link>
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              onClick={close}
              className="w-full sm:w-auto"
            >
              Nanti saja
            </Button>
          </div>
        </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

/** Seller-facing names. The API speaks in codes; a dialog should not. */
const FEATURE_LABELS: Partial<Record<GatedFeature, string>> = {
  pos: "Kasir POS",
  printer: "Struk printer Bluetooth",
  table_qr: "QR meja & layar dapur",
  ai_analytics: "Analisa & saran stok AI",
  membership: "Kartu member & tier",
  loyalty: "Poin loyalty",
  checkout_fields: "Kolom checkout custom",
  meta_integration: "Integrasi Meta",
};
