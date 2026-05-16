"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { PromoForm } from "@/components/dashboard/promo-form";
import type { Promo } from "@/lib/types";

type CreateProps = {
  mode: "create";
  promo?: never;
  onClose?: () => void;
};

type EditProps = {
  mode: "edit";
  promo: Promo;
  onClose?: () => void;
};

type Props = CreateProps | EditProps;

export function PromoDialog({ mode, promo, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(mode === "edit"); // edit opens immediately

  function close() {
    setOpen(false);
    onClose?.();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => { if (e.target === dialog) close(); };
    const onCancel = () => close();
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {mode === "create" && (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Buat Promo
        </Button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="promo-dialog-title"
        className="fixed left-1/2 top-1/2 m-0 max-h-[90vh] w-[min(640px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-0 text-left shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3.5">
          <h2
            id="promo-dialog-title"
            className="font-display text-base font-semibold text-neutral-900"
          >
            {mode === "edit" ? `Edit Promo ${promo.code}` : "Buat Promo"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Tutup"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="p-5">
          {open && (
            <PromoForm
              initial={mode === "edit" ? promo : undefined}
              onSuccess={close}
            />
          )}
        </div>
      </dialog>
    </>
  );
}

// Standalone edit trigger button — renders just the icon + dialog, no outer button wrapper.
export function PromoEditButton({ promo }: { promo: Promo }) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <Tooltip label="Edit promo" align="end">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit promo ${promo.code}`}
          className="inline-flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </Tooltip>
      {editing && (
        <PromoDialog
          mode="edit"
          promo={promo}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
