"use client";

import { useState } from "react";
import { X, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  sessionId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function CashMovementModal({ sessionId, onClose, onSuccess }: Props) {
  const [type, setType] = useState<"in" | "out">("out");
  const [amountRupiah, setAmountRupiah] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (amountRupiah <= 0 || !reason.trim()) {
      showError("Nominal dan alasan wajib diisi");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/sessions/${sessionId}/cash-movements`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount_cents: amountRupiah * 100,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal menyimpan");
        return;
      }
      showSuccess(type === "in" ? "Kas masuk dicatat" : "Kas keluar dicatat");
      onSuccess();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-popout">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-neutral-900">Kas Masuk / Keluar</h2>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType("in")}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors",
                type === "in"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-200 bg-white text-neutral-600",
              )}
            >
              <ArrowDownRight className="size-5" aria-hidden />
              <span className="text-sm font-medium">Kas Masuk</span>
            </button>
            <button
              onClick={() => setType("out")}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors",
                type === "out"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-neutral-200 bg-white text-neutral-600",
              )}
            >
              <ArrowUpRight className="size-5" aria-hidden />
              <span className="text-sm font-medium">Kas Keluar</span>
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Nominal (Rp)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                Rp
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={amountRupiah > 0 ? amountRupiah.toLocaleString("id-ID") : ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setAmountRupiah(digits === "" ? 0 : parseInt(digits, 10));
                }}
                className="h-11 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-4 text-right text-base font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Alasan</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={type === "in" ? "Misal: Setor uang" : "Misal: Beli air galon"}
              className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || amountRupiah <= 0 || !reason.trim()}
            className="flex-1 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:bg-neutral-300"
          >
            {loading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
