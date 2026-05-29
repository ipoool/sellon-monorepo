"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Banknote, PauseCircle, Power, Clock } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePOS } from "./pos-context";
import type { POSSession } from "@/lib/types";
import type { Me } from "@/lib/auth-types";

type Props = {
  me: Me;
  session: POSSession;
  onCashMovement: () => void;
  onHoldOrders: () => void;
  onCloseShift: () => void;
};

export function POSHeader({ me, session, onCashMovement, onHoldOrders, onCloseShift }: Props) {
  const router = useRouter();
  const { cart } = usePOS();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const openedAt = new Date(session.opened_at).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/sellon-logo.svg" alt="SellOn" className="h-6 w-auto shrink-0" />
        <span className="hidden text-sm text-neutral-400 sm:inline">·</span>
        <span className="hidden text-sm font-medium text-neutral-700 sm:inline">Kasir</span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          <Clock className="size-3.5" aria-hidden /> Sejak {openedAt}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onHoldOrders}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
        >
          <PauseCircle className="size-4" aria-hidden />
          Hold
        </button>
        <button
          onClick={onCashMovement}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
        >
          <Banknote className="size-4" aria-hidden />
          Kas
        </button>
        <button
          onClick={onCloseShift}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 active:bg-amber-200"
        >
          <Power className="size-4" aria-hidden />
          Tutup Shift
        </button>
        <span className="mx-2 hidden text-sm text-neutral-500 lg:inline">
          {me.name || me.email}
        </span>
        <button
          type="button"
          onClick={() => setShowExitConfirm(true)}
          title="Keluar dari mode kasir"
          aria-label="Keluar dari mode kasir"
          className="inline-flex size-10 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
        >
          <LogOut className="size-5" aria-hidden />
        </button>
      </div>

      <ConfirmDialog
        open={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={() => {
          setShowExitConfirm(false);
          router.push("/dashboard");
        }}
        title="Keluar dari mode kasir?"
        description={
          cart.length > 0
            ? `Cart kamu masih ada ${cart.length} item yang belum diproses. Item akan hilang kalau kamu keluar. Hold dulu kalau mau lanjut nanti.`
            : "Shift kasir tetap aktif. Kamu bisa kembali kapan saja dari menu Kasir POS."
        }
        confirmLabel="Keluar"
      />
    </header>
  );
}
