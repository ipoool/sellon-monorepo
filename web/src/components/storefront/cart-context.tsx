"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { SelectedOption } from "@/lib/types";

// Cart entries are denormalized snapshots — server re-validates price
// and stock at checkout, so a stale cart can't underpay or oversell.
// We persist to localStorage keyed by store slug so different stores
// don't share carts (and so closing the tab keeps the cart).
export type CartItem = {
  product_id: string;
  product_slug: string;
  product_name: string;
  variant_id?: string;
  variant_name?: string;
  unit_price_cents: number;
  qty: number;
  photo_url?: string;
  product_type: "physical" | "digital";
  available_stock: number;
  // Chosen modifier options. unit_price_cents already includes their deltas.
  selected_options?: SelectedOption[];
};

type CartState = {
  items: CartItem[];
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  hasDigital: boolean;
  hasPhysical: boolean;
  isAllDigital: boolean;
  isHydrated: boolean;
  addItem: (item: CartItem) => void;
  setQty: (key: string, qty: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const cartKey = (slug: string) => `sellon:cart:${slug}`;

function itemKey(
  it: Pick<CartItem, "product_id" | "variant_id" | "selected_options">,
): string {
  const opts = (it.selected_options ?? [])
    .map((o) => o.option_id)
    .sort()
    .join(",");
  return `${it.product_id}:${it.variant_id ?? ""}:${opts}`;
}

type Props = {
  storeSlug: string;
  children: ReactNode;
};

export function CartProvider({ storeSlug, children }: Props) {
  const [state, setState] = useState<CartState>({ items: [] });
  const [isHydrated, setIsHydrated] = useState(false);
  const hydrated = useRef(false);

  // Hydrate from localStorage once on mount. We delay to a useEffect
  // (rather than a lazy init) so SSR markup matches client first
  // render — `localStorage` is undefined on the server.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey(storeSlug));
      if (raw) {
        const parsed = JSON.parse(raw) as CartState;
        if (parsed && Array.isArray(parsed.items)) {
          setState(parsed);
        }
      }
    } catch {
      // Ignore — corrupted cart is no worse than empty cart.
    }
    hydrated.current = true;
    setIsHydrated(true);
  }, [storeSlug]);

  // Persist on every state change. Skip the initial render so we
  // don't overwrite real data with the empty default before hydrate.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(cartKey(storeSlug), JSON.stringify(state));
    } catch {
      // Quota exceeded etc. — silent no-op.
    }
  }, [state, storeSlug]);

  const addItem = useCallback((item: CartItem) => {
    setState((prev) => {
      const k = itemKey(item);
      const existing = prev.items.find((x) => itemKey(x) === k);
      let nextItems: CartItem[];
      if (existing) {
        // Same product+variant → bump qty, clamp to available stock for
        // physical items. Digital has unlimited stock — no cap.
        const newQty =
          existing.product_type === "digital"
            ? existing.qty + item.qty
            : Math.min(
                existing.qty + item.qty,
                existing.available_stock || existing.qty + item.qty,
              );
        nextItems = prev.items.map((x) =>
          itemKey(x) === k ? { ...x, qty: newQty } : x,
        );
      } else {
        nextItems = [...prev.items, item];
      }
      return { items: nextItems };
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setState((prev) => {
      const items = prev.items.reduce<CartItem[]>((acc, x) => {
        if (itemKey(x) !== key) {
          acc.push(x);
          return acc;
        }
        const nextQty =
          x.product_type === "digital"
            ? Math.max(1, qty)
            : Math.max(1, Math.min(qty, x.available_stock || qty));
        if (nextQty > 0) acc.push({ ...x, qty: nextQty });
        return acc;
      }, []);
      return { items };
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setState((prev) => ({
      items: prev.items.filter((x) => itemKey(x) !== key),
    }));
  }, []);

  const clear = useCallback(() => {
    setState({ items: [] });
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const items = state.items;
    const count = items.reduce((s, x) => s + x.qty, 0);
    const subtotal = items.reduce((s, x) => s + x.unit_price_cents * x.qty, 0);
    const hasDigital = items.some((x) => x.product_type === "digital");
    const hasPhysical = items.some((x) => x.product_type === "physical");
    return {
      items,
      count,
      subtotal,
      hasDigital,
      hasPhysical,
      isAllDigital: hasDigital && !hasPhysical,
      isHydrated,
      addItem,
      setQty,
      removeItem,
      clear,
    };
  }, [state, isHydrated, addItem, setQty, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = use(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return ctx;
}

// Safe variant for components that may render outside CartProvider (e.g. dashboard preview).
export function useOptionalCart(): CartContextValue | null {
  return use(CartContext);
}

export function cartItemKey(
  it: Pick<CartItem, "product_id" | "variant_id" | "selected_options">,
): string {
  return itemKey(it);
}
