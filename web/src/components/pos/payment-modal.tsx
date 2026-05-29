"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Banknote, QrCode, ArrowLeftRight, Split, Trash2, CreditCard, Sparkles } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { usePOS } from "./pos-context";
import type { POSPayment, POSPaymentMethod, POSOrderResult } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  totalCents: number;
  onClose: () => void;
  onSuccess: (result: POSOrderResult) => void;
};

type Mode = "single" | "split";

const methodLabels: Record<POSPaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  manual_transfer: "Transfer",
  midtrans: "Midtrans",
  edc_debit: "EDC Debit",
  edc_kredit: "EDC Kredit",
};

const methodIcons: Record<POSPaymentMethod, typeof Banknote> = {
  cash: Banknote,
  qris: QrCode,
  manual_transfer: ArrowLeftRight,
  midtrans: ArrowLeftRight,
  edc_debit: CreditCard,
  edc_kredit: CreditCard,
};

const BANK_OPTIONS = ["BCA", "Mandiri", "BRI", "BNI", "CIMB", "Permata", "Danamon", "BSI", "Lainnya"];

function isEDC(m: POSPaymentMethod): boolean {
  return m === "edc_debit" || m === "edc_kredit";
}

export function PaymentModal({ totalCents, onClose, onSuccess }: Props) {
  const { session, cart, discount, customerName, customerWA, subtotalCents, redeemPoints, midtransLive } = usePOS();
  const [mode, setMode] = useState<Mode>("single");
  const [singleMethod, setSingleMethod] = useState<POSPaymentMethod>("cash");
  const [singleAmount, setSingleAmount] = useState<number>(totalCents);
  const [splitRows, setSplitRows] = useState<POSPayment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // EDC fields untuk single mode (split mode masing-masing row handle sendiri).
  const [edcBank, setEdcBank] = useState("BCA");
  const [edcLast4, setEdcLast4] = useState("");
  const [edcRef, setEdcRef] = useState("");
  const [edcApproval, setEdcApproval] = useState("");

  const singlePayment: POSPayment = {
    method: singleMethod,
    amount_cents: singleAmount,
    ...(isEDC(singleMethod)
      ? {
          card_brand: edcBank,
          card_last4: edcLast4,
          reference_number: edcRef,
          approval_code: edcApproval,
        }
      : {}),
  };

  const payments: POSPayment[] = mode === "single" ? [singlePayment] : splitRows;

  const paid = useMemo(
    () => payments.reduce((sum, p) => sum + (p.amount_cents || 0), 0),
    [payments],
  );
  const change = paid - totalCents;
  const allEDCValid = payments.every(
    (p) => !isEDC(p.method) || (p.reference_number && p.reference_number.trim() !== ""),
  );
  // Free order: total fully covered by points/discount. No payment input
  // needed — submit straight away.
  const isFree = totalCents <= 0;
  const canSubmit =
    isFree ||
    (paid >= totalCents && payments.every((p) => p.amount_cents > 0) && allEDCValid);

  const handleQuickAmount = (cents: number) => {
    setSingleAmount(cents);
  };

  const addSplitRow = () => {
    setSplitRows([...splitRows, { method: "cash", amount_cents: 0 }]);
  };

  const updateSplit = (idx: number, patch: Partial<POSPayment>) => {
    setSplitRows((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeSplit = (idx: number) => {
    setSplitRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!session || !canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          customer_name: customerName,
          customer_wa: customerWA,
          discount_type: discount.type ?? "",
          discount_value: discount.value || 0,
          redeem_points: redeemPoints,
          // Free order (total 0): no payment rows — points/discount cover it.
          items: cart.map((c) => {
            // Auto-apply tier discount: hitung effective unit price per item.
            let effectiveUnit = c.unit_cents;
            if (c.discounts && c.discounts.length > 0) {
              const best = c.discounts
                .filter((d) => d.is_active && d.min_quantity <= c.quantity)
                .sort((a, b) => b.min_quantity - a.min_quantity)[0];
              if (best) {
                const lineGross = c.unit_cents * c.quantity;
                let lineDisc = 0;
                if (best.discount_type === "percent") {
                  const v = Math.max(0, Math.min(100, best.discount_value));
                  lineDisc = Math.floor((lineGross * v) / 100);
                } else {
                  lineDisc = Math.min(lineGross, Math.max(0, best.discount_value));
                }
                if (c.quantity > 0) {
                  effectiveUnit = Math.floor((lineGross - lineDisc) / c.quantity);
                }
              }
            }
            return {
              product_id: c.product_id,
              variant_id: c.variant_id ?? null,
              quantity: c.quantity,
              unit_cents: effectiveUnit,
              product_name: c.product_name,
              variant_name: c.variant_name ?? "",
              product_type: c.product_type,
              selected_option_ids: (c.selected_options ?? []).map(
                (o) => o.option_id,
              ),
              serving_type: c.serving_type ?? "",
            };
          }),
          payments: isFree ? [] : payments,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || `HTTP ${res.status}`);
        return;
      }
      const data: POSOrderResult = await res.json();
      onSuccess(data);
    } catch (e) {
      showError(`Gagal memproses pembayaran: ${e}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ESC to close, Enter to submit. NO click-outside (kasir butuh fokus,
  // tidak boleh tutup gak sengaja).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && canSubmit && !submitting) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, canSubmit, submitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-popout">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">Pembayaran</h2>
            <p className="text-sm text-neutral-500">
              Total: <strong className="text-neutral-900">{formatRupiah(totalCents)}</strong>
              {subtotalCents !== totalCents && (
                <span className="ml-1 text-xs text-neutral-400">
                  (subtotal {formatRupiah(subtotalCents)})
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Mode tabs — hidden for free orders (no payment to split) */}
        {!isFree && (
        <div className="border-b border-neutral-100 px-5 pt-3">
          <div className="inline-flex gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
            <button
              onClick={() => setMode("single")}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                mode === "single"
                  ? "bg-white text-neutral-900 shadow-soft"
                  : "text-neutral-600",
              )}
            >
              Satu Metode
            </button>
            <button
              onClick={() => {
                setMode("split");
                if (splitRows.length === 0) {
                  setSplitRows([
                    { method: "cash", amount_cents: 0 },
                    { method: "qris", amount_cents: 0 },
                  ]);
                }
              }}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                mode === "split"
                  ? "bg-white text-neutral-900 shadow-soft"
                  : "text-neutral-600",
              )}
            >
              <Split className="mr-1 inline size-3" aria-hidden /> Split
            </button>
          </div>
        </div>
        )}

        {/* Body */}
        <div className="px-5 py-4">
          {isFree ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Sparkles className="size-7" aria-hidden />
              </div>
              <p className="font-display text-lg font-semibold text-neutral-900">
                Transaksi Gratis
              </p>
              <p className="max-w-xs text-sm text-neutral-500">
                Total <strong className="text-neutral-700">Rp 0</strong> — sudah
                tertutup penuh oleh poin/diskon. Tidak perlu pembayaran, langsung
                proses saja.
              </p>
            </div>
          ) : mode === "single" ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(methodLabels) as POSPaymentMethod[]).map((m) => {
                  const Icon = methodIcons[m];
                  const disabled = m === "midtrans" && !midtransLive;
                  return (
                    <button
                      key={m}
                      onClick={() => !disabled && setSingleMethod(m)}
                      disabled={disabled}
                      title={disabled ? "Midtrans belum aktif — verifikasi key di Pengaturan Pembayaran" : undefined}
                      className={cn(
                        "relative flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-xs font-medium transition-colors",
                        disabled
                          ? "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 opacity-60"
                          : singleMethod === m
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300",
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      {methodLabels[m]}
                      {disabled && (
                        <span className="absolute -top-1 -right-1 rounded-full bg-neutral-400 px-1.5 py-0.5 text-[8px] font-bold text-white">
                          OFF
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-700">
                  {singleMethod === "cash" ? "Uang Diterima" : "Nominal"}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={
                      singleAmount > 0
                        ? Math.floor(singleAmount / 100).toLocaleString("id-ID")
                        : ""
                    }
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setSingleAmount(digits === "" ? 0 : parseInt(digits, 10) * 100);
                    }}
                    className="h-12 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-4 text-right text-xl font-bold text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>

                {singleMethod === "cash" && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {[totalCents, 50_000_00, 100_000_00, 200_000_00, 500_000_00].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => handleQuickAmount(amt)}
                          className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          {amt === totalCents ? "Pas" : formatRupiah(amt)}
                        </button>
                      ))}
                    </div>
                    {change >= 0 && (
                      <p className="text-sm text-neutral-600">
                        Kembalian:{" "}
                        <strong className={cn("text-base", change > 0 ? "text-brand-700" : "text-neutral-900")}>
                          {formatRupiah(change)}
                        </strong>
                      </p>
                    )}
                  </>
                )}

                {isEDC(singleMethod) && (
                  <div className="mt-2 grid gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1 sm:col-span-1">
                      <label className="text-xs font-medium text-neutral-600">Bank</label>
                      <select
                        value={edcBank}
                        onChange={(e) => setEdcBank(e.target.value)}
                        className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm"
                      >
                        {BANK_OPTIONS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 sm:col-span-1">
                      <label className="text-xs font-medium text-neutral-600">
                        4 Digit Terakhir <span className="text-neutral-400">(opsional)</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={edcLast4}
                        onChange={(e) => setEdcLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="1234"
                        className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-xs font-medium text-neutral-600">
                        Nomor Referensi (dari struk EDC) <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        value={edcRef}
                        onChange={(e) => setEdcRef(e.target.value)}
                        placeholder="REF/TXN/Trace"
                        className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-xs font-medium text-neutral-600">
                        Approval Code <span className="text-neutral-400">(opsional)</span>
                      </label>
                      <input
                        type="text"
                        value={edcApproval}
                        onChange={(e) => setEdcApproval(e.target.value)}
                        placeholder="Approval / Auth code"
                        className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {splitRows.map((row, idx) => (
                  <div key={idx} className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50 p-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={row.method}
                        onChange={(e) => updateSplit(idx, { method: e.target.value as POSPaymentMethod })}
                        className="h-10 w-32 rounded-lg border border-neutral-200 bg-white px-2 text-sm"
                      >
                        {(Object.keys(methodLabels) as POSPaymentMethod[]).map((m) => {
                          const disabled = m === "midtrans" && !midtransLive;
                          return (
                            <option key={m} value={m} disabled={disabled}>
                              {methodLabels[m]}{disabled ? " (belum aktif)" : ""}
                            </option>
                          );
                        })}
                      </select>
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={
                            row.amount_cents > 0
                              ? Math.floor(row.amount_cents / 100).toLocaleString("id-ID")
                              : ""
                          }
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            updateSplit(idx, {
                              amount_cents: digits === "" ? 0 : parseInt(digits, 10) * 100,
                            });
                          }}
                          className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-3 text-right text-sm font-semibold focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      {splitRows.length > 1 && (
                        <button
                          onClick={() => removeSplit(idx)}
                          className="rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                    {isEDC(row.method) && (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={row.card_brand ?? "BCA"}
                          onChange={(e) => updateSplit(idx, { card_brand: e.target.value })}
                          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs"
                        >
                          {BANK_OPTIONS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={row.card_last4 ?? ""}
                          onChange={(e) => updateSplit(idx, { card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                          placeholder="4 digit terakhir"
                          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs font-mono"
                        />
                        <input
                          type="text"
                          value={row.reference_number ?? ""}
                          onChange={(e) => updateSplit(idx, { reference_number: e.target.value })}
                          placeholder="No. Referensi *"
                          className="col-span-2 h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={addSplitRow}
                  className="self-start rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
                >
                  + Tambah metode
                </button>
              </div>

              <div className="mt-4 flex justify-between border-t border-neutral-100 pt-3 text-sm">
                <span className="text-neutral-600">Sudah dibayar:</span>
                <span className={cn("font-semibold", paid >= totalCents ? "text-brand-700" : "text-danger")}>
                  {formatRupiah(paid)} / {formatRupiah(totalCents)}
                </span>
              </div>
              {change >= 0 && paid > totalCents && (
                <p className="mt-1 text-right text-sm text-neutral-600">
                  Kembalian: <strong>{formatRupiah(change)}</strong>
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="relative flex-1 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:bg-neutral-300"
          >
            {submitting
              ? "Memproses..."
              : isFree
                ? "Selesaikan Transaksi"
                : "Proses Pembayaran"}
            {!submitting && (
              <kbd className="absolute -top-1 -right-1 rounded-full bg-neutral-400 px-1.5 py-0.5 font-mono text-[8px] font-bold text-white">
                Enter
              </kbd>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
