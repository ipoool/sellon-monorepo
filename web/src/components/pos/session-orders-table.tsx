"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, XCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import type { POSSessionOrder } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function methodLabel(method: string): string {
  switch (method) {
    case "cash": return "Tunai";
    case "qris": return "QRIS";
    case "manual_transfer":
    case "bank_transfer":
      return "Transfer";
    case "midtrans": return "Midtrans";
    case "pos_split": return "Split";
    default: return method || "—";
  }
}

type Props = {
  orders: POSSessionOrder[];
  sessionStatus: "open" | "closed" | string;
};

type Mode = "void" | "return";

export function SessionOrdersTable({ orders, sessionStatus }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<{ order: POSSessionOrder; mode: Mode } | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    if (!target || !reason.trim()) return;
    setLoading(true);
    try {
      const endpoint = target.mode === "void" ? "void" : "return";
      const res = await fetch(`${apiBase}/api/v1/pos/orders/${target.order.order_id}/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal");
        return;
      }
      showSuccess(target.mode === "void" ? "Transaksi dibatalkan" : "Retur dicatat");
      setTarget(null);
      setReason("");
      router.refresh();
    } catch {
      showError("Gagal memproses");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Waktu</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">No. Order</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Pelanggan</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Item</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Bayar</th>
              <th className="px-4 py-2 text-right font-medium text-neutral-500">Total</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Status</th>
              <th className="px-4 py-2 text-right font-medium text-neutral-500">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {orders.map((o) => {
              const isCancelled = o.status === "cancelled";
              const canVoid = !isCancelled && sessionStatus === "open";
              const canReturn = !isCancelled && sessionStatus !== "open";
              return (
                <tr key={o.order_id} className={isCancelled ? "opacity-60" : "hover:bg-neutral-50"}>
                  <td className="px-4 py-2 text-neutral-500">{formatTime(o.created_at)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-700">#{o.order_number}</td>
                  <td className="px-4 py-2 text-neutral-700">{o.customer_name || "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{o.item_count} item</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="font-normal">
                      {methodLabel(o.payment_method)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-neutral-900">
                    {formatRupiah(o.total_cents)}
                  </td>
                  <td className="px-4 py-2">
                    {isCancelled ? (
                      <Badge variant="danger">
                        {o.refunded_at ? "Diretur" : "Dibatalkan"}
                      </Badge>
                    ) : (
                      <Badge variant="success">Selesai</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/pos/orders/${o.order_id}/receipt`}
                        target="_blank"
                        title="Cetak struk"
                        className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <Printer className="size-3.5" aria-hidden />
                      </Link>
                      {canVoid && (
                        <button
                          onClick={() => setTarget({ order: o, mode: "void" })}
                          title="Void transaksi"
                          className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-danger/10 hover:text-danger"
                        >
                          <XCircle className="size-3.5" aria-hidden />
                        </button>
                      )}
                      {canReturn && (
                        <button
                          onClick={() => setTarget({ order: o, mode: "return" })}
                          title="Retur"
                          className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-amber-100 hover:text-amber-700"
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm dialog */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setTarget(null)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-popout">
            <h3 className="font-display text-lg font-semibold text-neutral-900">
              {target.mode === "void" ? "Void Transaksi" : "Retur Transaksi"}
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              #{target.order.order_number} — {formatRupiah(target.order.total_cents)}
            </p>
            <p className="mt-3 text-sm text-neutral-700">
              {target.mode === "void"
                ? "Transaksi akan dibatalkan dan stok dikembalikan. Tindakan ini tidak bisa di-undo."
                : "Pesanan ditandai sebagai diretur. Stok dikembalikan. Catat alasan retur untuk laporan."}
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-700">
                Alasan <span className="text-danger">*</span>
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={target.mode === "void" ? "Misal: Salah input" : "Misal: Pembeli kembalikan barang"}
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setTarget(null);
                  setReason("");
                }}
                disabled={loading}
              >
                Batal
              </Button>
              <Button
                onClick={handleAction}
                disabled={!reason.trim() || loading}
                className={target.mode === "void" ? "" : ""}
              >
                {loading ? "Memproses..." : target.mode === "void" ? "Void Sekarang" : "Catat Retur"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
