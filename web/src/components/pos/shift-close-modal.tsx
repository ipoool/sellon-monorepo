"use client";

import { useEffect, useState } from "react";
import { Power, X } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { POSSessionSummary } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  sessionId: string;
  onClose: () => void;
  onClosed: () => void;
};

export function ShiftCloseModal({ sessionId, onClose, onClosed }: Props) {
  const [summary, setSummary] = useState<POSSessionSummary | null>(null);
  const [actualRupiah, setActualRupiah] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/v1/pos/sessions/${sessionId}/summary`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary);
        setActualRupiah(Math.floor((d.summary?.expected_cash ?? 0) / 100));
      });
  }, [sessionId]);

  const handleClose = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/sessions/${sessionId}/close`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_cash_cents: actualRupiah * 100 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal menutup shift");
        return;
      }
      showSuccess("Shift berhasil ditutup");
      onClosed();
    } catch {
      showError("Gagal menutup shift");
    } finally {
      setSubmitting(false);
    }
  };

  const expected = summary?.expected_cash ?? 0;
  const diff = actualRupiah * 100 - expected;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-popout">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Power className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-neutral-900">Tutup Shift</h2>
              <p className="text-sm text-neutral-500">Cek rekap dan input kas aktual</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4">
          {!summary ? (
            <p className="py-8 text-center text-sm text-neutral-500">Memuat rekap...</p>
          ) : (
            <>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Penjualan</h3>
              <dl className="space-y-1 text-sm">
                <Row label="Tunai" value={summary.total_cash} />
                <Row label="QRIS" value={summary.total_qris} />
                <Row label="Transfer" value={summary.total_transfer} />
                <Row label="Midtrans" value={summary.total_midtrans} />
                <Row label="Total Penjualan" value={summary.total_sales} bold />
                <p className="text-xs text-neutral-400">{summary.order_count} transaksi</p>
              </dl>

              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">Kas</h3>
              <dl className="space-y-1 text-sm">
                <Row label="Kas Awal" value={summary.session.opening_cash_cents} />
                <Row label="Cash In" value={summary.total_cash_in} />
                <Row label="Cash Out" value={-summary.total_cash_out} />
                <Row label="Ekspektasi di Laci" value={summary.expected_cash} bold />
              </dl>

              <div className="mt-4 flex flex-col gap-1.5">
                <label className="text-sm font-medium text-neutral-700">Kas Aktual di Laci (Rp)</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={actualRupiah > 0 ? actualRupiah.toLocaleString("id-ID") : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setActualRupiah(digits === "" ? 0 : parseInt(digits, 10));
                    }}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-4 text-right text-base font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                {diff !== 0 && (
                  <p className={cn("text-xs", diff > 0 ? "text-brand-700" : "text-danger")}>
                    Selisih: {diff > 0 ? "+" : ""}{formatRupiah(diff)} {diff > 0 ? "(lebih)" : "(kurang)"}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Nanti dulu
          </button>
          <button
            onClick={handleClose}
            disabled={!summary || submitting}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:bg-neutral-300"
          >
            {submitting ? "Menutup..." : "Tutup Shift"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold ? "border-t border-neutral-100 pt-1 font-semibold text-neutral-900" : "text-neutral-600")}>
      <dt>{label}</dt>
      <dd>{formatRupiah(value)}</dd>
    </div>
  );
}
