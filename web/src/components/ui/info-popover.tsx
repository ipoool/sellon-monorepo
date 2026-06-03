"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Small click-to-open popover for contextual help (e.g. step-by-step setup
// instructions) — keeps section subtitles clean instead of stuffing long
// instructions into them. Closes on click-outside or Escape. No deps.
export function InfoPopover({
  label = "Cara setup",
  title,
  children,
  align = "left",
  className,
}: {
  label?: string;
  title?: string;
  children: ReactNode;
  // Which edge of the trigger the panel anchors to. Use "right" when the
  // trigger sits on the right of its row so the panel opens inward.
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
      >
        <HelpCircle className="size-4" aria-hidden />
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          className={cn(
            "absolute top-full z-30 mt-2 w-[min(380px,88vw)] rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-popout",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            {title && (
              <p className="font-display text-sm font-semibold text-neutral-900">{title}</p>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup"
              className="-mr-1 -mt-1 ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="text-sm leading-relaxed text-neutral-600">{children}</div>
        </div>
      )}
    </div>
  );
}
