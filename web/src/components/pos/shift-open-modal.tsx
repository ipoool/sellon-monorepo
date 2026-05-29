"use client";

import { useState } from "react";
import { Power } from "lucide-react";
import { showError } from "@/lib/toast";
import type { POSSession } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  onSuccess: (s: POSSession) => void;
  onCancel: () => void;
};

export function ShiftOpenModal({ onSuccess, onCancel }: Props) {
  const [openingRupiah, setOpeningRupiah] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opening_cash_cents: openingRupiah * 100,
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal membuka shift");
        return;
      }
      const data = await res.json();
      onSuccess(data.session);
    } catch {
      showError("Gagal membuka shift");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-popout">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Power className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">Buka Shift Kasir</h2>
            <p className="text-sm text-neutral-500">Input kas awal di laci untuk mulai berjualan</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <label className="text-sm font-medium text-neutral-700">Kas Awal (Rp)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
              Rp
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={openingRupiah > 0 ? openingRupiah.toLocaleString("id-ID") : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setOpeningRupiah(digits === "" ? 0 : parseInt(digits, 10));
              }}
              placeholder="0"
              className="h-12 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-4 text-right text-lg font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <label className="mt-2 text-sm font-medium text-neutral-700">
            Catatan <span className="text-xs text-neutral-400">(opsional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Misal: Shift pagi"
            rows={2}
            className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Batal
          </button>
          <button
            onClick={handleOpen}
            disabled={loading}
            className="flex-1 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:bg-neutral-300"
          >
            {loading ? "Membuka..." : "Mulai Berjualan"}
          </button>
        </div>
      </div>
    </div>
  );
}
