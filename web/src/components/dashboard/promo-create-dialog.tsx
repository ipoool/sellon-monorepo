"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromoForm } from "@/components/dashboard/promo-form";

export function PromoCreateDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) setOpen(false);
    };
    const onCancel = () => setOpen(false);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  }, []);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Buat Promo
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="promo-create-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(640px,95vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3.5">
          <h2
            id="promo-create-title"
            className="font-display text-base font-semibold text-neutral-900"
          >
            Buat Promo
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="p-5">
          {open && <PromoForm onSuccess={() => setOpen(false)} />}
        </div>
      </dialog>
    </>
  );
}
