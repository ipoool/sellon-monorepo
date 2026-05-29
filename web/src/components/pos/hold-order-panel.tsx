"use client";

import { useEffect, useState } from "react";
import { X, PauseCircle, Trash2, RotateCcw } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast";
import { usePOS } from "./pos-context";
import type { POSHeldOrder, POSCartItem } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  sessionId: string;
  onClose: () => void;
  onRestored: () => void;
};

export function HoldOrderPanel({ sessionId, onClose, onRestored }: Props) {
  const { cart, loadCart, clearCart } = usePOS();
  const [held, setHeld] = useState<POSHeldOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHoldForm, setShowHoldForm] = useState(cart.length > 0);
  const [label, setLabel] = useState("");

  const refetch = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/pos/held?session_id=${sessionId}`,
        { credentials: "include" },
      );
      const data = await res.json();
      setHeld(data.held ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleHold = async () => {
    if (cart.length === 0) return;
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/held`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          label: label.trim(),
          cart_snapshot: cart,
        }),
      });
      if (!res.ok) throw new Error();
      showSuccess("Transaksi ditahan");
      clearCart();
      setShowHoldForm(false);
      setLabel("");
      refetch();
    } catch {
      showError("Gagal hold");
    }
  };

  const handleRestore = (h: POSHeldOrder) => {
    if (cart.length > 0 && !confirm("Cart sekarang akan diganti. Lanjutkan?")) return;
    const items = h.cart_snapshot as POSCartItem[];
    loadCart(items);
    handleDelete(h.id, true);
    showSuccess("Transaksi dipulihkan");
    onRestored();
  };

  const handleDelete = async (id: string, silent = false) => {
    try {
      await fetch(`${apiBase}/api/v1/pos/held/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!silent) showSuccess("Dihapus");
      refetch();
    } catch {
      if (!silent) showError("Gagal hapus");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-popout">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-neutral-900">
            <PauseCircle className="size-5" aria-hidden />
            Transaksi Ditahan
          </h2>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Hold form */}
        {showHoldForm && cart.length > 0 && (
          <div className="border-b border-neutral-100 bg-brand-50 px-5 py-4">
            <p className="text-sm font-medium text-neutral-700">
              Tahan transaksi sekarang ({cart.length} item)?
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (opsional, misal: Meja 3)"
                className="h-9 flex-1 rounded-md border border-neutral-200 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={handleHold}
                className="rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
              >
                Tahan
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-center text-sm text-neutral-500">Memuat...</p>
          ) : held.length === 0 ? (
            <p className="mt-12 text-center text-sm text-neutral-400">
              Belum ada transaksi yang ditahan.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {held.map((h) => {
                const items = h.cart_snapshot as POSCartItem[];
                const totalCents = items.reduce((s, i) => s + i.unit_cents * i.quantity, 0);
                const time = new Date(h.created_at).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <li
                    key={h.id}
                    className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900">
                        {h.label || `Tahanan ${time}`}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {items.length} item · Rp {(totalCents / 100).toLocaleString("id-ID")}
                      </p>
                      <p className="text-xs text-neutral-400">{time}</p>
                    </div>
                    <button
                      onClick={() => handleRestore(h)}
                      className="flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
