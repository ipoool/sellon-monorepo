"use client";

import { useEffect, useRef, useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { Crown, Loader2, X, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Plan = "pro" | "bisnis";
type Mode = "months" | "date";

const planOptions: { value: Plan; label: string; description: string }[] = [
  {
    value: "pro",
    label: "Pro",
    description: "Unlimited produk + pesanan, semua fitur dasar.",
  },
  {
    value: "bisnis",
    label: "Bisnis",
    description: "Pro + multi-staf + report lanjutan.",
  },
];

type Props = {
  storeId: string;
  storeName: string;
  currentPlan?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "menu";
  triggerLabel?: string;
  onOpen?: () => void;
};

export function AdminGrantSubscriptionDialog({
  storeId,
  storeName,
  currentPlan,
  triggerVariant = "outline",
  triggerLabel = "Atur Langganan",
  onOpen,
}: Props) {
  const { refresh } = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>("pro");
  const [mode, setMode] = useState<Mode>("months");
  const [months, setMonths] = useState(1);
  const [expiresAt, setExpiresAt] = useState(() => defaultDate(30));
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
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
      if (!busy) setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d && !busy) setOpen(false);
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, [busy]);

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { plan };
      if (mode === "months") body.months = months;
      else body.expires_at = expiresAt;
      const res = await fetch(
        `${apiBase}/api/v1/admin/stores/${storeId}/subscription`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFlash(`Langganan ${storeName} di-set ke ${plan.toUpperCase()}.`);
      setTimeout(() => {
        setOpen(false);
        setFlash(null);
        refresh();
      }, 900);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {triggerVariant === "menu" ? (
        <button
          type="button"
          onClick={() => { onOpen?.(); setFlash(null); setOpen(true); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          <Crown className="size-4 shrink-0 text-neutral-400" aria-hidden />
          {triggerLabel}
        </button>
      ) : (
      <Button
        size="sm"
        variant={triggerVariant as "default" | "outline" | "ghost"}
        onClick={() => {
          onOpen?.();
          setFlash(null);
          setOpen(true);
        }}
      >
        <Crown className="size-3.5" aria-hidden />
        {triggerLabel}
      </Button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="grant-sub-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(520px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
          <div>
            <h2
              id="grant-sub-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Atur Langganan
            </h2>
            <p className="mt-0.5 text-xs text-neutral-600">
              {storeName}
              {currentPlan && (
                <>
                  {" · "}
                  <Badge variant="default">Saat ini: {currentPlan}</Badge>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && setOpen(false)}
            aria-label="Tutup"
            className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="rounded-md border border-brand-200 bg-brand-50/60 p-3 text-xs text-neutral-700">
            <p className="flex items-center gap-1.5 font-semibold text-neutral-900">
              <Sparkles className="size-3.5 text-brand-600" aria-hidden />
              Mode Admin Grant
            </p>
            <p className="mt-1">
              Aksi ini set plan + masa berlaku langsung tanpa pembayaran.
              Cocok untuk trial kolega / testing internal. Tercatat di audit
              log dengan provider <code>admin_grant</code>.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grant-plan">Pilih Plan</Label>
            <Select
              id="grant-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
              disabled={busy}
            >
              {planOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} - {opt.description}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-mode">Masa Berlaku</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("months")}
                disabled={busy}
                className={
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
                  (mode === "months"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
                }
              >
                Berdasarkan Bulan
              </button>
              <button
                type="button"
                onClick={() => setMode("date")}
                disabled={busy}
                className={
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
                  (mode === "date"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
                }
              >
                Tanggal Spesifik
              </button>
            </div>

            {mode === "months" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grant-months" className="text-xs">
                  Berapa bulan dari sekarang? (1-60)
                </Label>
                <Input
                  id="grant-months"
                  type="number"
                  min={1}
                  max={60}
                  value={months}
                  onChange={(e) =>
                    setMonths(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  disabled={busy}
                />
                <p className="text-xs text-neutral-500">
                  Berakhir kira-kira: {monthsToDateLabel(months)}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grant-date" className="text-xs">
                  Tanggal expired
                </Label>
                <Input
                  id="grant-date"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={defaultDate(1)}
                  disabled={busy}
                />
              </div>
            )}
          </div>

                    {flash && (
            <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success">
              {flash}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => !busy && setOpen(false)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Crown className="size-3.5" aria-hidden />
            )}
            Set {plan.toUpperCase()}
          </Button>
        </div>
      </dialog>
    </>
  );
}

function defaultDate(addDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  return d.toISOString().slice(0, 10);
}

function monthsToDateLabel(months: number): string {
  const d = new Date();
  d.setDate(d.getDate() + months * 30);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
