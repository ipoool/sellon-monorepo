"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ShieldAlert, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Kind = "default" | "warning" | "danger";

const kindStyles: Record<
  Kind,
  {
    iconBg: string;
    iconColor: string;
    icon: typeof AlertTriangle;
    confirmVariant: "default" | "destructive";
  }
> = {
  default: {
    iconBg: "bg-brand-50",
    iconColor: "text-brand-700",
    icon: Info,
    confirmVariant: "default",
  },
  warning: {
    iconBg: "bg-warning/15",
    iconColor: "text-neutral-800",
    icon: ShieldAlert,
    confirmVariant: "default",
  },
  danger: {
    iconBg: "bg-danger/10",
    iconColor: "text-danger",
    icon: AlertTriangle,
    confirmVariant: "destructive",
  },
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: Kind;
  busy?: boolean;
  /**
   * Optional accent on the confirm button text — useful when the action
   * isn't strictly destructive but you want it to stand out (e.g. "Mulai
   * impersonate"). Defaults from the kind preset.
   */
  confirmIcon?: ReactNode;
  /**
   * If set, the dialog renders an input that the user must type to match
   * (case-insensitive). The confirm button stays disabled until the input
   * matches. Pattern: "type DELETE to confirm".
   */
  requireTypedPhrase?: string;
  /**
   * Inline error shown just above the footer. Callers that keep the dialog
   * open after a failed action must use this instead of a toast — the dialog
   * is opened with showModal(), so it lives in the top layer and any toast
   * renders *behind* it (invisible and undismissable).
   */
  error?: ReactNode;
};

// Reusable confirmation dialog using the native <dialog> element with
// backdrop blur. Pattern matches berlangganan-actions.tsx — no extra
// dependency, focus-trap is built-in via showModal(), Escape closes.
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  kind = "default",
  busy = false,
  confirmIcon,
  requireTypedPhrase,
  error,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Several screens mount multiple ConfirmDialogs at once. Hard-coded ids
  // made aria-labelledby / htmlFor resolve to the FIRST match in the DOM —
  // usually a closed dialog — leaving the open one unnamed.
  const uid = useId();
  const titleId = `${uid}-title`;
  const phraseId = `${uid}-phrase`;
  const cfg = kindStyles[kind];
  const [typed, setTyped] = useState("");
  const phraseSatisfied =
    !requireTypedPhrase ||
    typed.trim().toUpperCase() === requireTypedPhrase.toUpperCase();

  // Sync open prop ↔ native dialog open state. Reset the typed input
  // every time the dialog re-opens so a previously satisfied phrase
  // doesn't auto-arm a different action later.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTyped("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Bind Escape + backdrop click to onClose. Native <dialog> fires a
  // 'cancel' event on Escape; clicks outside the inner content bubble
  // up to the dialog element itself.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // we control closing via the prop
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

  const Icon = cfg.icon;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="fixed left-1/2 top-1/2 m-0 w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start gap-4 p-6">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            cfg.iconBg,
            cfg.iconColor,
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="font-display text-base font-semibold text-neutral-900"
          >
            {title}
          </h2>
          <div className="mt-2 text-sm leading-relaxed text-neutral-600">
            {description}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {requireTypedPhrase && (
        <div className="border-t border-neutral-200 bg-neutral-50/60 px-6 py-4">
          <Label htmlFor={phraseId} className="text-xs">
            Ketik{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-danger ring-1 ring-neutral-200">
              {requireTypedPhrase}
            </code>{" "}
            untuk konfirmasi
          </Label>
          <Input
            id={phraseId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={requireTypedPhrase}
            disabled={busy}
            className="mt-1.5 font-mono uppercase tracking-wider"
          />
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="border-t border-danger/20 bg-danger/5 px-6 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={busy}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cfg.confirmVariant}
          onClick={onConfirm}
          disabled={busy || !phraseSatisfied}
        >
          {confirmIcon}
          {busy ? "Memproses…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
