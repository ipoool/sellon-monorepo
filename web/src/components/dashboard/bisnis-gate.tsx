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
import { Crown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/dashboard/plan-context";

type GateCtx = {
  // true when the current plan is below Bisnis (feature is locked).
  locked: boolean;
  // open the "Bisnis-only" dialog for a feature label.
  openGate: (featureLabel?: string) => void;
};

const Ctx = createContext<GateCtx>({ locked: false, openGate: () => {} });

// useBisnisGate exposes whether Bisnis features are locked for the current
// plan and a helper to pop the upgrade dialog. Used by nav items/tabs that
// stay VISIBLE but, when clicked by a non-Bisnis seller, show the dialog
// instead of navigating.
export function useBisnisGate(): GateCtx {
  return useContext(Ctx);
}

export function BisnisGateProvider({ children }: { children: ReactNode }) {
  const plan = usePlan();
  const locked = plan !== "bisnis";
  const [label, setLabel] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openGate = (featureLabel?: string) =>
    setLabel(featureLabel || "Fitur ini");
  const close = () => setLabel(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (label !== null && !d.open) d.showModal();
    if (label === null && d.open) d.close();
  }, [label]);

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

  return (
    <Ctx.Provider value={{ locked, openGate }}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="bisnis-gate-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-0 text-left shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <button
            type="button"
            onClick={close}
            aria-label="Tutup"
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4" aria-hidden />
          </button>
          <div className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Crown className="size-7" aria-hidden />
          </div>
          <h2
            id="bisnis-gate-title"
            className="mt-4 font-display text-lg font-semibold text-neutral-900"
          >
            {label} hanya untuk paket Bisnis
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Fitur ini eksklusif untuk pelanggan paket Bisnis (Rp299rb/bulan).
            Upgrade sekarang untuk membukanya — datamu yang sudah ada tetap aman.
          </p>
          <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/settings/subscription" onClick={close}>
              <Button size="md" className="w-full sm:w-auto">
                <Crown className="size-4" aria-hidden />
                Lihat Paket Bisnis
              </Button>
            </Link>
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
      </dialog>
    </Ctx.Provider>
  );
}
