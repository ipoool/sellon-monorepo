"use client";

import { useEffect, useRef } from "react";
import { Check, X, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

type Props = {
  open: boolean;
  categories: Category[];
  active: string; // "" = Semua
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function CategoryPickerModal({
  open,
  categories,
  active,
  onSelect,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d) onClose();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, [onClose]);

  const options = [{ id: "", name: "Semua Kategori" }, ...categories];

  return (
    <dialog
      ref={dialogRef}
      aria-label="Pilih kategori"
      className="m-auto w-[min(560px,95vw)] max-h-[85vh] rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-neutral-900">
            <LayoutGrid className="size-4 text-brand-600" aria-hidden />
            Pilih Kategori
          </h2>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            aria-label="Tutup"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options.map((cat) => {
              const isActive = active === cat.id;
              return (
                <button
                  key={cat.id || "all"}
                  onClick={() => onSelect(cat.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors",
                    isActive
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-brand-200 hover:bg-brand-50/50",
                  )}
                >
                  <span className="line-clamp-2">{cat.name}</span>
                  {isActive && (
                    <Check className="size-4 shrink-0 text-brand-600" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </dialog>
  );
}
