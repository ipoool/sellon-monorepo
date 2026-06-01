"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ShoppingCart, X, Plus, Minus, Trash2 } from "lucide-react";

import { formatRupiah } from "@/lib/format";
import {
  useCart,
  cartItemKey,
  type CartItem,
} from "@/components/storefront/cart-context";
import { setKioskActive } from "./kiosk-mode";
import { KioskOptionSheet } from "./kiosk-option-sheet";
import { KioskPaymentScreen } from "./kiosk-payment-screen";
import type { KioskProduct, PublicPayment } from "./types";

type KioskCtx = { openOptions: (p: KioskProduct) => void; active: boolean };
const KioskContext = createContext<KioskCtx | null>(null);

// Consumed by ProductKioskCard so a tile with variants/add-ons opens the
// option sheet instead of adding the bare product. Null outside the kiosk
// flow (e.g. the dashboard layout preview).
export function useKioskCheckout(): KioskCtx | null {
  return useContext(KioskContext);
}

type Props = {
  slug: string;
  storeName?: string;
  payment?: PublicPayment;
  acceptingOrders?: boolean;
  acceptingOrdersReason?: string;
  children: ReactNode;
};

// Root of the kiosk fast-checkout: provides the option-sheet trigger, renders
// the sticky cart bar, the slide-up cart sheet, and the full-screen payment /
// confirmation flow — all in-page, no route navigation.
export function KioskCheckout({
  slug,
  storeName,
  payment,
  acceptingOrders = true,
  acceptingOrdersReason = "",
  children,
}: Props) {
  const cart = useCart();
  const [view, setView] = useState<"browse" | "cart" | "checkout">("browse");
  const [optionProduct, setOptionProduct] = useState<KioskProduct | null>(null);
  const [checkoutItems, setCheckoutItems] = useState<CartItem[]>([]);

  // Suppress the global CartFab while the kiosk owns the bottom of the screen.
  useEffect(() => {
    setKioskActive(true);
    return () => setKioskActive(false);
  }, []);

  const orderLimit = acceptingOrdersReason === "order_limit";
  const canOrder = acceptingOrders && !orderLimit;

  const startCheckout = () => {
    if (cart.items.length === 0 || !canOrder) return;
    setCheckoutItems(cart.items);
    setView("checkout");
  };

  return (
    <KioskContext.Provider value={{ openOptions: setOptionProduct, active: true }}>
      {children}

      {view === "browse" && cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-3 shadow-popout sm:p-4">
          <button
            type="button"
            onClick={() => setView("cart")}
            className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl bg-brand-600 px-5 py-4 text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5 font-semibold">
              <span className="relative">
                <ShoppingCart className="size-6" aria-hidden />
                <span className="absolute -right-2 -top-2 flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand-700">
                  {cart.count}
                </span>
              </span>
              Lihat Pesanan
            </span>
            <span className="font-display text-lg font-bold tabular-nums">
              {formatRupiah(cart.subtotal)}
            </span>
          </button>
        </div>
      )}

      {view === "cart" && (
        <KioskCartSheet
          canOrder={canOrder}
          orderLimit={orderLimit}
          onClose={() => setView("browse")}
          onPay={startCheckout}
        />
      )}

      {optionProduct && (
        <KioskOptionSheet product={optionProduct} onClose={() => setOptionProduct(null)} />
      )}

      {view === "checkout" && (
        <KioskPaymentScreen
          slug={slug}
          storeName={storeName}
          payment={payment}
          items={checkoutItems}
          onSuccess={() => {
            cart.clear();
            setView("browse");
          }}
          onCancel={() => setView("cart")}
        />
      )}
    </KioskContext.Provider>
  );
}

function KioskCartSheet({
  canOrder,
  orderLimit,
  onClose,
  onPay,
}: {
  canOrder: boolean;
  orderLimit: boolean;
  onClose: () => void;
  onPay: () => void;
}) {
  const cart = useCart();
  const empty = cart.items.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Tutup"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85svh] w-full flex-col rounded-t-3xl bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <p className="font-display text-lg font-bold text-neutral-900">Pesanan Kamu</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex size-9 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {empty ? (
            <p className="py-10 text-center text-neutral-400">Keranjang masih kosong.</p>
          ) : (
            cart.items.map((it) => <CartRow key={cartItemKey(it)} it={it} />)
          )}
        </div>

        <div className="border-t border-neutral-100 p-4">
          {orderLimit && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Toko sementara tidak menerima pesanan baru.
            </p>
          )}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-neutral-500">Total</span>
            <span className="font-display text-xl font-bold text-neutral-900 tabular-nums">
              {formatRupiah(cart.subtotal)}
            </span>
          </div>
          <button
            type="button"
            onClick={onPay}
            disabled={empty || !canOrder}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-brand-600 text-base font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Bayar Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}

function CartRow({ it }: { it: CartItem }) {
  const cart = useCart();
  const key = cartItemKey(it);
  const opts = (it.selected_options ?? []).map((o) => o.option_name).join(", ");

  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">{it.product_name}</p>
        {opts && <p className="truncate text-xs text-neutral-500">{opts}</p>}
        <p className="text-sm font-semibold text-brand-600 tabular-nums">
          {formatRupiah(it.unit_price_cents * it.qty)}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={it.qty <= 1 ? "Hapus" : "Kurangi"}
          onClick={() =>
            it.qty <= 1 ? cart.removeItem(key) : cart.setQty(key, it.qty - 1)
          }
          className="flex size-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 active:scale-90"
        >
          {it.qty <= 1 ? <Trash2 className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
        </button>
        <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums">
          {it.qty}
        </span>
        <button
          type="button"
          aria-label="Tambah"
          onClick={() => cart.setQty(key, it.qty + 1)}
          className="flex size-9 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 active:scale-90"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
