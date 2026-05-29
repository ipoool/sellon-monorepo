"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Printer, MessageCircle, Plus, Bluetooth } from "lucide-react";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import { usePOS } from "./pos-context";
import {
  isBluetoothSupported,
  printReceiptBluetooth,
} from "@/lib/bluetooth-printer";
import type { OrderDetail, Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  changeCents: number;
  cashierName: string;
  onClose: () => void;
};

export function SuccessModal({ orderId, orderNumber, totalCents, changeCents, cashierName, onClose }: Props) {
  const { printerConfig, loyaltyCustomer, customerWA } = usePOS();
  // Pre-fill the WA field with the member's / buyer's number from this
  // transaction so the cashier can send the receipt in one tap. Context still
  // holds the customer here — it's only cleared when the modal closes.
  const [phone, setPhone] = useState(
    loyaltyCustomer?.whatsapp_number || customerWA || "",
  );
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);

  const useBluetooth =
    printerConfig?.method === "bluetooth" && isBluetoothSupported();

  // Fetch full order + store, then print via Bluetooth ESC/POS.
  const printViaBluetooth = async () => {
    setPrinting(true);
    try {
      const [orderRes, storeRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/orders/${orderId}`, { credentials: "include" }).then(
          (r) => (r.ok ? r.json() : Promise.reject()),
        ),
        fetch(`${apiBase}/api/v1/store`, { credentials: "include" }).then((r) =>
          r.ok ? r.json() : Promise.reject(),
        ),
      ]);
      const order: OrderDetail = orderRes.order;
      const store: Store | null = storeRes.store ?? null;
      await printReceiptBluetooth(order, store, cashierName, {
        paperWidth: printerConfig?.paper_width ?? "58",
        copies: printerConfig?.copies ?? 1,
        header: printerConfig?.header ?? "",
        footer: printerConfig?.footer ?? "",
      });
      showSuccess("Struk terkirim ke printer");
    } catch (e) {
      if (e instanceof Error && e.name === "CancelledError") return;
      showError(e instanceof Error ? e.message : "Gagal cetak via Bluetooth");
    } finally {
      setPrinting(false);
    }
  };

  const openBrowserReceipt = () => {
    window.open(`/pos/orders/${orderId}/receipt?autoprint=1`, "_blank");
  };

  const handlePrint = () => {
    if (useBluetooth) printViaBluetooth();
    else openBrowserReceipt();
  };

  // Auto-print once on mount when enabled. Browser path may be popup-blocked
  // (no user gesture) — the manual button stays as fallback.
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (autoPrinted.current || !printerConfig?.auto_print) return;
    autoPrinted.current = true;
    handlePrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printerConfig]);

  const handleSendWA = async () => {
    if (!phone.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/orders/${orderId}/send-receipt`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal kirim WhatsApp");
        return;
      }
      showSuccess("Struk terkirim via WhatsApp");
      setPhone("");
    } catch {
      showError("Gagal kirim WhatsApp");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-popout">
        <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <CheckCircle2 className="size-7" aria-hidden />
          </div>
          <h2 className="font-display text-2xl font-bold text-neutral-900">
            Transaksi Berhasil
          </h2>
          <p className="text-sm text-neutral-500">Struk #{orderNumber}</p>
          <div className="mt-2 rounded-lg bg-neutral-50 px-5 py-3">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Total Pembayaran</p>
            <p className="font-display text-3xl font-bold text-neutral-900">
              {formatRupiah(totalCents)}
            </p>
            {changeCents > 0 && (
              <p className="mt-1 text-sm text-brand-700">
                Kembalian: <strong>{formatRupiah(changeCents)}</strong>
              </p>
            )}
          </div>
        </div>

        {/* WA form */}
        <div className="border-t border-neutral-100 px-6 py-4">
          <label className="text-xs font-medium text-neutral-600">Kirim struk via WhatsApp</label>
          <div className="mt-1 flex gap-2">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxx"
              className="h-9 flex-1 text-sm"
            />
            <button
              onClick={handleSendWA}
              disabled={sending || !phone.trim()}
              className="rounded-md bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 disabled:bg-neutral-300"
            >
              <MessageCircle className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-neutral-100 bg-neutral-50 px-6 py-4">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            {useBluetooth ? (
              <Bluetooth className="size-4" aria-hidden />
            ) : (
              <Printer className="size-4" aria-hidden />
            )}
            {printing
              ? "Mencetak…"
              : useBluetooth
                ? "Cetak via Bluetooth"
                : "Cetak Struk"}
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <Plus className="size-4" aria-hidden />
            Transaksi Baru
          </button>
        </div>
      </div>
    </div>
  );
}
