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

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  product_type: "physical" | "digital" | "course";
  available_stock: number;
  // Chosen modifier options. unit_price_cents already includes their deltas.
  selected_options?: SelectedOption[];
};

type CartState = {
  items: CartItem[];
};

// One line whose snapshot no longer matches the seller's catalog. Surfaced to
// the buyer (cart + checkout) so a silent re-price can't happen between "add to
// cart" and the server-computed order total.
export type CartNotice = {
  key: string;
  product_name: string;
  kind: "price" | "stock" | "gone";
  old_price_cents: number;
  new_price_cents: number;
  available_stock: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  hasDigital: boolean;
  hasPhysical: boolean;
  isAllDigital: boolean;
  isHydrated: boolean;
  notices: CartNotice[];
  dismissNotices: () => void;
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

// Subset of the public storefront payload the reconcile needs.
type FreshProduct = {
  id?: string;
  product_type?: CartItem["product_type"];
  price_cents?: number;
  stock?: number;
  track_stock?: boolean;
  variants?: Array<{ id: string; name: string; price_cents: number; stock: number }>;
};

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

  // Reconcile the cart against the authoritative catalog once after hydration.
  // The cart is a localStorage snapshot: product_type, unit price, stock and
  // variant availability all go stale. The server silently recomputes the
  // order from the DB at checkout, so an un-reconciled line means the buyer
  // reviews Rp 50.000 and gets charged Rp 75.000. One-shot, fail-safe (no-op
  // on error; unchanged when everything matches, so no spurious persist).
  const [notices, setNotices] = useState<CartNotice[]>([]);
  const reconciledRef = useRef(false);
  // Latest lines, readable from the async reconcile below without adding a
  // dependency that would abort the in-flight fetch on every cart change.
  const itemsRef = useRef(state.items);
  useEffect(() => {
    itemsRef.current = state.items;
  }, [state.items]);
  useEffect(() => {
    if (!isHydrated || reconciledRef.current || state.items.length === 0) return;
    reconciledRef.current = true;
    const ctrl = new AbortController();
    void fetch(`${apiBase}/api/v1/storefront/${storeSlug}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { products?: FreshProduct[] } | null) => {
        if (!data || !Array.isArray(data.products)) return;
        const byId = new Map<string, FreshProduct>();
        for (const p of data.products) {
          if (p && typeof p.id === "string") byId.set(p.id, p);
        }

        // Diff OUTSIDE the state updater (updaters must stay pure — React
        // re-invokes them), then apply the patches by line key.
        const found: CartNotice[] = [];
        const patches = new Map<string, Partial<CartItem>>();
        for (const it of itemsRef.current) {
          const key = itemKey(it);
          const fresh = byId.get(it.product_id);
          if (!fresh) {
            // Delisted/unpublished — flag it but keep the line so the buyer
            // decides (the server rejects it at checkout anyway).
            found.push({
              key,
              product_name: it.product_name,
              kind: "gone",
              old_price_cents: it.unit_price_cents,
              new_price_cents: it.unit_price_cents,
              available_stock: 0,
            });
            continue;
          }
          const patch: Partial<CartItem> = {};
          const type = fresh.product_type ?? it.product_type;
          if (type !== it.product_type) patch.product_type = type;

          // Price: the variant's price when the line has one, else the
          // product's, plus the modifier deltas already captured on the line.
          const variant = it.variant_id
            ? (fresh.variants ?? []).find((v) => v.id === it.variant_id)
            : undefined;
          const variantMissing = !!it.variant_id && !!fresh.variants && !variant;
          const base = variant ? variant.price_cents : fresh.price_cents;
          const optionDelta = (it.selected_options ?? []).reduce(
            (sum, o) => sum + (o.price_delta_cents ?? 0),
            0,
          );
          // Only re-price when the payload carries the numbers this line needs
          // (a variant line with no variants array is left alone rather than
          // silently re-priced to the parent product's price).
          const canReprice =
            typeof base === "number" && !(it.variant_id && !variant);
          const freshUnit = canReprice ? base + optionDelta : it.unit_price_cents;

          // Stock: 0 means "unlimited" by cart convention — only tracked
          // products (physical, or a capped digital) carry a real cap.
          const tracked = fresh.track_stock ?? type === "physical";
          const freshStock = tracked
            ? Math.max(0, variant ? variant.stock : fresh.stock ?? 0)
            : 0;

          if (freshUnit !== it.unit_price_cents) {
            patch.unit_price_cents = freshUnit;
            found.push({
              key,
              product_name: it.product_name,
              kind: "price",
              old_price_cents: it.unit_price_cents,
              new_price_cents: freshUnit,
              available_stock: freshStock,
            });
          }
          if (freshStock !== it.available_stock) {
            patch.available_stock = freshStock;
          }
          if (variantMissing || (tracked && freshStock === 0)) {
            found.push({
              key,
              product_name: it.product_name,
              kind: variantMissing ? "gone" : "stock",
              old_price_cents: it.unit_price_cents,
              new_price_cents: freshUnit,
              available_stock: freshStock,
            });
          } else if (tracked && it.qty > freshStock) {
            // Snapshot qty above the remaining stock — clamp now instead of
            // failing on the last step of checkout.
            patch.qty = freshStock;
            found.push({
              key,
              product_name: it.product_name,
              kind: "stock",
              old_price_cents: it.unit_price_cents,
              new_price_cents: freshUnit,
              available_stock: freshStock,
            });
          }
          if (Object.keys(patch).length > 0) patches.set(key, patch);
        }

        if (patches.size > 0) {
          setState((prev) => {
            let changed = false;
            const items = prev.items.map((it) => {
              const patch = patches.get(itemKey(it));
              if (!patch) return it;
              changed = true;
              return { ...it, ...patch };
            });
            return changed ? { items } : prev;
          });
        }
        if (found.length > 0) setNotices(found);
      })
      .catch(() => {
        // Network/abort — keep the snapshot as-is (no worse than before).
      });
    return () => ctrl.abort();
  }, [isHydrated, storeSlug, state.items.length]);

  const dismissNotices = useCallback(() => setNotices([]), []);

  const addItem = useCallback((item: CartItem) => {
    setState((prev) => {
      const k = itemKey(item);
      const existing = prev.items.find((x) => itemKey(x) === k);
      let nextItems: CartItem[];
      if (existing) {
        // Same product+variant → bump qty, clamped to available_stock. That cap
        // is the per-line finite quantity (physical stock, or a capped digital's
        // remaining quota); 0/falsy means unlimited (uncapped non-physical).
        const newQty = Math.min(
          existing.qty + item.qty,
          existing.available_stock || existing.qty + item.qty,
        );
        nextItems = prev.items.map((x) =>
          itemKey(x) === k ? { ...x, qty: newQty } : x,
        );
      } else {
        // New line — clamp to the cap too (available_stock 0 = unlimited).
        // Without this, a variant switch after the qty stepper was raised
        // could put an impossible quantity in the cart that only fails on
        // the last step of checkout.
        const cap = item.available_stock;
        nextItems = [
          ...prev.items,
          cap > 0 ? { ...item, qty: Math.max(1, Math.min(item.qty, cap)) } : item,
        ];
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
        const nextQty = Math.max(1, Math.min(qty, x.available_stock || qty));
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
    setNotices([]);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const items = state.items;
    const count = items.reduce((s, x) => s + x.qty, 0);
    const subtotal = items.reduce((s, x) => s + x.unit_price_cents * x.qty, 0);
    // "hasDigital" = has any non-physical item (digital or course): both need
    // a buyer email and skip shipping. hasPhysical drives the shipping step.
    const hasDigital = items.some((x) => x.product_type !== "physical");
    const hasPhysical = items.some((x) => x.product_type === "physical");
    return {
      items,
      count,
      subtotal,
      hasDigital,
      hasPhysical,
      isAllDigital: hasDigital && !hasPhysical,
      isHydrated,
      notices,
      dismissNotices,
      addItem,
      setQty,
      removeItem,
      clear,
    };
  }, [state, isHydrated, notices, dismissNotices, addItem, setQty, removeItem, clear]);

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
