"use client";

import { useState, useEffect, useRef } from "react";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  PauseCircle,
  Tag,
  Pencil,
  Sparkles,
  UserPlus,
  X,
  ChevronRight,
} from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { POSCartItem, ProductDiscount } from "@/lib/types";
import { usePOS, posLineKey } from "./pos-context";
import { CustomerPickerModal } from "./customer-picker-modal";

type Props = {
  onCheckout: () => void;
  onHold: () => void;
};

// tierHint builds an upsell nudge for an item with active volume discount
// tiers, so the cashier can tell the customer "buy 3+ to get a discount"
// before they decide. Returns null when the product has no active tiers.
function fmtDisc(d: ProductDiscount): string {
  return d.discount_type === "percent"
    ? `${d.discount_value}%`
    : formatRupiah(d.discount_value);
}

function tierHint(
  item: POSCartItem,
): { text: string; active: boolean } | null {
  const tiers = (item.discounts ?? [])
    .filter((d) => d.is_active)
    .sort((a, b) => a.min_quantity - b.min_quantity);
  if (tiers.length === 0) return null;

  // Highest tier already satisfied by current qty, and the next one above.
  const activeTier = [...tiers]
    .reverse()
    .find((d) => d.min_quantity <= item.quantity);
  const nextTier = tiers.find((d) => d.min_quantity > item.quantity);

  if (nextTier) {
    const need = nextTier.min_quantity - item.quantity;
    if (activeTier) {
      return {
        active: true,
        text: `Diskon ${fmtDisc(activeTier)} aktif · +${need} lagi → ${fmtDisc(nextTier)}`,
      };
    }
    return {
      active: false,
      text: `Beli ${nextTier.min_quantity}+ diskon ${fmtDisc(nextTier)} (kurang ${need})`,
    };
  }
  if (activeTier) {
    return { active: true, text: `Diskon volume ${fmtDisc(activeTier)} aktif` };
  }
  return null;
}

export function CartPanel({ onCheckout, onHold }: Props) {
  const {
    cart,
    updateQty,
    setItemPrice,
    removeFromCart,
    clearCart,
    discount,
    setDiscount,
    customerName,
    customerWA,
    setCustomerName,
    setCustomerWA,
    subtotalCents,
    tierDiscountCents,
    discountCents,
    redeemDiscountCents,
    totalCents,
    loyaltyConfig,
    loyaltyCustomer,
    setLoyaltyCustomer,
    redeemPoints,
    setRedeemPoints,
    isTouch,
  } = usePOS();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Auto-scroll ke bawah saat item baru ditambahkan ke cart.
  const cartListRef = useRef<HTMLDivElement>(null);
  const prevCartLenRef = useRef(0);
  useEffect(() => {
    if (cart.length > prevCartLenRef.current && cartListRef.current) {
      // Scroll smooth ke posisi paling bawah dari container daftar item.
      const el = cartListRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    prevCartLenRef.current = cart.length;
  }, [cart.length]);

  const hasCustomer = Boolean(
    loyaltyCustomer || customerName.trim() || customerWA.trim(),
  );

  const clearCustomer = () => {
    setLoyaltyCustomer(null);
    setCustomerName("");
    setCustomerWA("");
    setRedeemPoints(0);
  };

  // Cap redeem to the points actually usable on this bill, so "pakai semua
  // poin" never deducts more points than the total can absorb (extra points
  // would be burned for zero added discount).
  const availablePoints = loyaltyCustomer?.loyalty_points ?? 0;
  const redeemRate = loyaltyConfig?.redeem_rate_cents ?? 0;
  const remainingBeforeRedeem = Math.max(
    0,
    subtotalCents - tierDiscountCents - discountCents,
  );
  const maxUsablePoints =
    redeemRate > 0
      ? Math.min(availablePoints, Math.floor(remainingBeforeRedeem / redeemRate))
      : availablePoints;

  const startEdit = (key: string, currentCents: number) => {
    setEditingKey(key);
    setEditValue(String(Math.floor(currentCents / 100)));
  };

  const commitEdit = (lineKey: string) => {
    const rupiah = parseInt(editValue.replace(/\D/g, ""), 10) || 0;
    setItemPrice(lineKey, rupiah * 100);
    setEditingKey(null);
  };

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-neutral-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3.5">
        <div className="flex items-center gap-2 text-base font-semibold text-neutral-900">
          <ShoppingCart className="size-5" aria-hidden />
          Transaksi ({cart.length})
        </div>
        {cart.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-danger/10 hover:text-danger"
          >
            Kosongkan
          </button>
        )}
      </div>

      {/* Items */}
      <div ref={cartListRef} className="flex-1 overflow-y-auto p-3">
        {cart.length === 0 ? (
          <p className="mt-12 text-center text-sm text-neutral-400">
            Klik produk di kiri untuk mulai transaksi.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cart.map((item) => {
              const k = posLineKey(item);
              const isEditing = editingKey === k;
              const hint = tierHint(item);
              return (
              <li
                key={k}
                className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50 p-3"
              >
                {/* Row 1: nama produk (boleh wrap) + tombol hapus */}
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-neutral-900">
                    {item.product_name}
                    {item.variant_name ? ` (${item.variant_name})` : ""}
                  </p>
                  <button
                    onClick={() => removeFromCart(k)}
                    aria-label="Hapus item"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                {/* Selected modifier options */}
                {item.selected_options && item.selected_options.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {item.selected_options.map((o) => o.option_name).join(" · ")}
                  </p>
                )}

                {/* Serving choice + take-away packaging (separate billable line) */}
                {item.serving_type && (
                  <span
                    className={cn(
                      "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      item.serving_type === "takeaway"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-neutral-200 text-neutral-600",
                    )}
                  >
                    {item.serving_type === "takeaway" ? "Take Away" : "Dine In"}
                  </span>
                )}
                {item.serving_type === "takeaway" &&
                  (item.takeaway_charge_cents ?? 0) > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-dashed border-amber-200 bg-amber-50/60 px-2 py-1 text-xs text-neutral-600">
                      <span>
                        + {item.takeaway_label || "Take Away"} × {item.quantity}
                      </span>
                      <span className="tabular-nums">
                        {formatRupiah((item.takeaway_charge_cents ?? 0) * item.quantity)}
                      </span>
                    </div>
                  )}

                {/* Row 2: harga satuan (bisa diedit) + hint diskon */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-neutral-400">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editValue ? parseInt(editValue, 10).toLocaleString("id-ID") : ""}
                        onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit(k);
                          if (e.key === "Escape") setEditingKey(null);
                        }}
                        onBlur={() => commitEdit(k)}
                        autoFocus
                        className="h-8 w-28 rounded-md border border-brand-300 bg-white px-2 text-right text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <span className="text-xs text-neutral-400">/ pcs</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(k, item.unit_cents)}
                      title="Edit harga"
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm text-neutral-600 hover:bg-white hover:text-brand-700"
                    >
                      {formatRupiah(item.unit_cents)}
                      <span className="text-xs text-neutral-400">/ pcs</span>
                      <Pencil className="size-3 opacity-50" aria-hidden />
                    </button>
                  )}
                  {hint && (
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium " +
                        (hint.active
                          ? "bg-brand-100 text-brand-700"
                          : "border border-dashed border-brand-300 bg-brand-50/60 text-brand-700")
                      }
                    >
                      <Tag className="size-2.5 shrink-0" aria-hidden />
                      {hint.text}
                    </span>
                  )}
                </div>

                {/* Row 3: stepper qty (kiri) + subtotal baris (kanan) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(k, -1)}
                      aria-label="Kurangi jumlah"
                      className="flex size-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="w-10 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(k, 1)}
                      aria-label="Tambah jumlah"
                      className="flex size-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <strong className="text-sm font-bold text-neutral-900 tabular-nums">
                    {formatRupiah(item.unit_cents * item.quantity)}
                  </strong>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Customer picker + Discount + Loyalty */}
      {cart.length > 0 && (
        <div className="border-t border-neutral-100 px-3 py-3 space-y-2">
          {!hasCustomer ? (
            <button
              onClick={() => setShowPicker(true)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                loyaltyConfig?.enabled
                  ? "border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <UserPlus className="size-4" aria-hidden />
                Pilih Pelanggan
                {loyaltyConfig?.enabled && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-800">
                    <Sparkles className="size-2.5" aria-hidden /> Poin
                  </span>
                )}
              </span>
              <ChevronRight className="size-4 opacity-60" aria-hidden />
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {loyaltyCustomer?.name || customerName || "Tanpa nama"}
                </p>
                <p className="truncate font-mono text-xs text-neutral-500">
                  {loyaltyCustomer?.whatsapp_number || customerWA || "—"}
                </p>
              </div>
              <button
                onClick={() => setShowPicker(true)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                Ganti
              </button>
              <button
                onClick={clearCustomer}
                className="flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-danger"
                aria-label="Hapus pelanggan"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Tag className="size-4 shrink-0 text-neutral-400" aria-hidden />
            <select
              value={discount.type ?? ""}
              onChange={(e) =>
                setDiscount({
                  type: (e.target.value || null) as "percent" | "fixed" | null,
                  value: 0,
                })
              }
              className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-900"
            >
              <option value="">Tanpa diskon</option>
              <option value="percent">%</option>
              <option value="fixed">Rp</option>
            </select>
            {discount.type && (
              <input
                type="number"
                value={discount.value || ""}
                onChange={(e) => setDiscount({ ...discount, value: parseInt(e.target.value, 10) || 0 })}
                placeholder={discount.type === "percent" ? "0-100" : "Nominal"}
                className="h-9 flex-1 rounded-md border border-neutral-200 bg-white px-2.5 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none"
              />
            )}
          </div>

          {/* Loyalty: redeem points UI */}
          {loyaltyConfig?.enabled && loyaltyCustomer && (
            <div className="rounded-md border border-brand-200 bg-brand-50 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 shrink-0 text-brand-700" aria-hidden />
                <p className="min-w-0 flex-1 text-xs text-brand-700">
                  <strong className="text-brand-900">
                    {availablePoints.toLocaleString("id-ID")}
                  </strong>{" "}
                  poin tersedia
                </p>
                {availablePoints > 0 && (
                  <input
                    type="number"
                    value={redeemPoints || ""}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10) || 0;
                      setRedeemPoints(Math.min(n, maxUsablePoints));
                    }}
                    max={maxUsablePoints}
                    placeholder="Tukar"
                    className="h-8 w-20 rounded-md border border-brand-300 bg-white px-1.5 text-right text-sm text-brand-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                )}
              </div>
              {availablePoints > 0 && (
                <button
                  onClick={() => setRedeemPoints(maxUsablePoints)}
                  disabled={maxUsablePoints <= 0 || redeemPoints >= maxUsablePoints}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  <Sparkles className="size-3.5" aria-hidden />
                  Pakai semua poin ({maxUsablePoints.toLocaleString("id-ID")})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary + Pay */}
      <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotalCents)}</span>
          </div>
          {tierDiscountCents > 0 && (
            <div className="flex justify-between text-brand-700">
              <span>Diskon Volume</span>
              <span>−{formatRupiah(tierDiscountCents)}</span>
            </div>
          )}
          {discountCents > 0 && (
            <div className="flex justify-between text-neutral-600">
              <span>Diskon</span>
              <span>−{formatRupiah(discountCents)}</span>
            </div>
          )}
          {redeemDiscountCents > 0 && (
            <div className="flex justify-between text-brand-700">
              <span>Poin ({redeemPoints})</span>
              <span>−{formatRupiah(redeemDiscountCents)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-bold text-neutral-900">
            <span>TOTAL</span>
            <span>{formatRupiah(totalCents)}</span>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={onHold}
            disabled={cart.length === 0}
            aria-label="Tahan transaksi"
            className="flex items-center justify-center rounded-lg border border-neutral-200 bg-white px-4 py-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            <PauseCircle className="size-5" aria-hidden />
          </button>
          <button
            onClick={onCheckout}
            disabled={cart.length === 0}
            className="flex-1 rounded-lg bg-brand-700 px-4 py-3.5 text-base font-semibold text-white hover:bg-brand-800 disabled:bg-neutral-300"
          >
            Bayar {formatRupiah(totalCents)}
            {!isTouch && <span className="text-xs opacity-70"> (F8)</span>}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          clearCart();
          setShowClearConfirm(false);
        }}
        title="Kosongkan transaksi?"
        description={`${cart.length} item akan dihapus dari cart. Tindakan ini tidak bisa di-undo.`}
        confirmLabel="Kosongkan"
      />

      <CustomerPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
      />
    </aside>
  );
}
