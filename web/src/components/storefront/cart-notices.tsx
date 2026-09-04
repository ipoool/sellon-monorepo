"use client";

import { AlertTriangle } from "lucide-react";

import { formatRupiah } from "@/lib/format";
import { useCart } from "./cart-context";

// Banner listing the cart lines whose price/stock changed since they were
// added. The buyer sees the new numbers BEFORE the server quietly recomputes
// the order total at checkout.
export function CartNotices({ className }: { className?: string }) {
  const { notices, dismissNotices } = useCart();
  if (notices.length === 0) return null;

  return (
    <div
      className={
        "rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" +
        (className ? ` ${className}` : "")
      }
      role="status"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-neutral-900">
            Ada perubahan di keranjangmu
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs text-neutral-700">
            {notices.map((n, i) => (
              <li key={`${n.key}-${n.kind}-${i}`}>
                <span className="font-medium text-neutral-900">
                  {n.product_name}
                </span>{" "}
                {n.kind === "price" ? (
                  <>
                    — harga diperbarui dari {formatRupiah(n.old_price_cents)} jadi{" "}
                    {formatRupiah(n.new_price_cents)}
                  </>
                ) : n.kind === "stock" ? (
                  n.available_stock > 0 ? (
                    <>— jumlah disesuaikan, sisa stok {n.available_stock}</>
                  ) : (
                    <>— stoknya habis</>
                  )
                ) : (
                  <>— sudah tidak dijual, hapus dulu sebelum checkout</>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={dismissNotices}
            className="mt-2 text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            Oke, mengerti
          </button>
        </div>
      </div>
    </div>
  );
}
