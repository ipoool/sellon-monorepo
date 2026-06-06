"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { POSSession, POSCartItem, SelectedOption } from "@/lib/types";
import {
  saveCart as dbSaveCart,
  loadCart as dbLoadCart,
  saveActiveSession,
  loadActiveSession,
} from "@/lib/offline/db";

type DiscountState = {
  type: "percent" | "fixed" | null;
  value: number; // % (0-100) or cents
};

export type LoyaltyCustomer = {
  id: string;
  name: string;
  whatsapp_number: string;
  loyalty_points: number;
  total_orders: number;
};

export type LoyaltyConfig = {
  enabled: boolean;
  earn_rate_cents: number;
  redeem_rate_cents: number;
};

export type PrinterConfig = {
  method: "browser" | "bluetooth" | string;
  paper_width: "58" | "80" | string;
  auto_print: boolean;
  copies: number;
  header: string;
  footer: string;
};

export type TaxConfig = {
  enabled: boolean;
  bps: number; // basis points, 1100 = 11%
  inclusive: boolean; // true = tax already inside price (informational); false = added on top
  label: string; // e.g. "PPN"
};

// Mirror of the backend repository.ComputeTaxCents — MUST stay in sync so the
// cashier collects exactly what the API will persist (an exclusive tax raises
// the order total, and the API rejects a payment that doesn't cover it).
// All inputs are non-negative cents, so Math.round (half-up) matches Go's
// math.Round (half-away-from-zero).
export function computePOSTaxCents(
  base: number,
  bps: number,
  inclusive: boolean,
): number {
  if (base <= 0 || bps <= 0) return 0;
  return inclusive
    ? Math.round((base * bps) / (10000 + bps))
    : Math.round((base * bps) / 10000);
}

type POSContextValue = {
  // True on touch devices (tablets/phones) — used to hide keyboard
  // shortcut hints (F2/F8) that only make sense with a physical keyboard.
  isTouch: boolean;

  session: POSSession | null;
  setSession: Dispatch<SetStateAction<POSSession | null>>;

  loyaltyConfig: LoyaltyConfig | null;
  setLoyaltyConfig: (c: LoyaltyConfig | null) => void;
  printerConfig: PrinterConfig | null;
  setPrinterConfig: (c: PrinterConfig | null) => void;
  taxConfig: TaxConfig | null;
  setTaxConfig: (c: TaxConfig | null) => void;
  loyaltyCustomer: LoyaltyCustomer | null;
  setLoyaltyCustomer: (c: LoyaltyCustomer | null) => void;
  redeemPoints: number;
  setRedeemPoints: (n: number) => void;

  midtransLive: boolean;
  setMidtransLive: (v: boolean) => void;
  offlineEnabled: boolean;
  setOfflineEnabled: (v: boolean) => void;

  cart: POSCartItem[];
  addToCart: (item: POSCartItem) => void;
  updateQty: (lineKey: string, delta: number) => void;
  setQty: (lineKey: string, qty: number) => void;
  setItemPrice: (lineKey: string, unitCents: number) => void;
  removeFromCart: (lineKey: string) => void;
  clearCart: () => void;
  loadCart: (items: POSCartItem[]) => void;

  discount: DiscountState;
  setDiscount: (d: DiscountState) => void;

  customerName: string;
  customerWA: string;
  setCustomerName: (s: string) => void;
  setCustomerWA: (s: string) => void;

  subtotalCents: number;
  tierDiscountCents: number;
  discountCents: number;
  redeemDiscountCents: number;
  // Total of goods after all discounts, before tax. This is the tax base and
  // matches the backend's (subtotal − discount) base for POS orders.
  preTaxTotalCents: number;
  taxCents: number;
  totalCents: number;
};

const POSContext = createContext<POSContextValue | null>(null);

// Line identity includes selected options so the same product+variant with
// different options (e.g. Large+Keju vs Large) are separate cart lines.
export function posLineKey(it: {
  product_id: string;
  variant_id?: string | null;
  selected_options?: SelectedOption[];
  serving_type?: string;
}): string {
  const opts = (it.selected_options ?? [])
    .map((o) => o.option_id)
    .sort()
    .join(",");
  return `${it.product_id}::${it.variant_id ?? ""}::${opts}::${it.serving_type ?? ""}`;
}

export function POSProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<POSSession | null>(null);
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [discount, setDiscount] = useState<DiscountState>({ type: null, value: 0 });
  const [customerName, setCustomerName] = useState("");
  const [customerWA, setCustomerWA] = useState("");
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null);
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig | null>(null);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<LoyaltyCustomer | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [midtransLive, setMidtransLive] = useState(false);
  const [offlineEnabled, setOfflineEnabled] = useState(false);

  // Detect touch / coarse-pointer devices so keyboard shortcut hints can
  // hide on tablets. Defaults to false (desktop) to avoid SSR/hydration
  // mismatch; corrected on mount + on input-method change.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Persist the in-progress cart to IndexedDB so it survives a refresh or going
  // offline. Restore once on mount, then save on every change. `hydrated` gates
  // the save so the initial empty state can't clobber a saved cart before the
  // async restore lands.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    Promise.all([dbLoadCart(), loadActiveSession()]).then(([s, cachedSession]) => {
      if (s) {
        setCart(s.cart ?? []);
        setCustomerName(s.customerName ?? "");
        setCustomerWA(s.customerWA ?? "");
        if (s.discount) setDiscount(s.discount);
        setRedeemPoints(s.redeemPoints ?? 0);
      }
      // Restore a cached open shift ONLY when offline — a cold offline reload
      // can't reach the server for the active session, so the cache is the only
      // source. When online the server's initialSession is authoritative (it
      // knows if the shift was closed elsewhere), so we don't resurrect a stale
      // cached shift. The functional update still defers to anything already set.
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (cachedSession && offline) setSession((prev) => prev ?? cachedSession);
      setHydrated(true);
    });
  }, []);
  // Cart bundle — note: NO session here. The active shift has its own key so a
  // cart write can never null it out (see saveActiveSession below).
  useEffect(() => {
    if (!hydrated) return;
    void dbSaveCart({ cart, customerName, customerWA, discount, redeemPoints });
  }, [hydrated, cart, customerName, customerWA, discount, redeemPoints]);
  // Persist the active shift on its own key with explicit open/close semantics:
  // a non-null session is stored, a close (null) deletes it. Gated on `hydrated`
  // so the initial null (before restore) can't delete a cached shift.
  useEffect(() => {
    if (!hydrated) return;
    void saveActiveSession(session);
  }, [hydrated, session]);

  const addToCart = useCallback((item: POSCartItem) => {
    setCart((prev) => {
      const k = posLineKey(item);
      const idx = prev.findIndex((x) => posLineKey(x) === k);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity };
        return next;
      }
      return [...prev, item];
    });
  }, []);

  const updateQty = useCallback((lineKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((x) =>
          posLineKey(x) === lineKey
            ? { ...x, quantity: Math.max(0, x.quantity + delta) }
            : x,
        )
        .filter((x) => x.quantity > 0),
    );
  }, []);

  const setQty = useCallback((lineKey: string, qty: number) => {
    setCart((prev) =>
      prev
        .map((x) =>
          posLineKey(x) === lineKey ? { ...x, quantity: Math.max(0, qty) } : x,
        )
        .filter((x) => x.quantity > 0),
    );
  }, []);

  const setItemPrice = useCallback((lineKey: string, unitCents: number) => {
    setCart((prev) =>
      prev.map((x) =>
        posLineKey(x) === lineKey ? { ...x, unit_cents: Math.max(0, unitCents) } : x,
      ),
    );
  }, []);

  const removeFromCart = useCallback((lineKey: string) => {
    setCart((prev) => prev.filter((x) => posLineKey(x) !== lineKey));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscount({ type: null, value: 0 });
    setCustomerName("");
    setCustomerWA("");
    setLoyaltyCustomer(null);
    setRedeemPoints(0);
  }, []);

  const loadCart = useCallback((items: POSCartItem[]) => {
    setCart(items);
  }, []);

  const subtotalCents = useMemo(
    () =>
      cart.reduce((sum, x) => {
        // Take-away packaging is billed as a separate amount per unit; the
        // backend mirrors this (it appends a packaging line to the order).
        const pkg =
          x.serving_type === "takeaway"
            ? (x.takeaway_charge_cents ?? 0) * x.quantity
            : 0;
        return sum + x.unit_cents * x.quantity + pkg;
      }, 0),
    [cart],
  );

  // Tier discount per line item: pilih tier dengan min_quantity tertinggi
  // yang masih dipenuhi qty saat ini.
  const tierDiscountCents = useMemo(() => {
    return cart.reduce((sum, x) => {
      if (!x.discounts || x.discounts.length === 0) return sum;
      const eligible = x.discounts
        .filter((d) => d.is_active && d.min_quantity <= x.quantity)
        .sort((a, b) => b.min_quantity - a.min_quantity);
      const best = eligible[0];
      if (!best) return sum;
      const lineGross = x.unit_cents * x.quantity;
      let disc = 0;
      if (best.discount_type === "percent") {
        const v = Math.max(0, Math.min(100, best.discount_value));
        disc = Math.floor((lineGross * v) / 100);
      } else {
        disc = Math.min(lineGross, Math.max(0, best.discount_value));
      }
      return sum + disc;
    }, 0);
  }, [cart]);

  const discountCents = useMemo(() => {
    const baseAfterTier = subtotalCents - tierDiscountCents;
    if (discount.type === "percent") {
      const v = Math.max(0, Math.min(100, discount.value));
      return Math.floor((baseAfterTier * v) / 100);
    }
    if (discount.type === "fixed") {
      return Math.min(baseAfterTier, Math.max(0, discount.value));
    }
    return 0;
  }, [discount, subtotalCents, tierDiscountCents]);

  // Auto-clamp redeemPoints to what the bill can actually absorb. Without
  // this, lowering the cart total after points were entered would leave
  // redeemPoints too high — the discount caps correctly, but the customer
  // would be debited more points than the discount is worth. Re-runs on any
  // bill change so the redeemed points always match the payable total.
  useEffect(() => {
    if (!loyaltyConfig?.enabled || !loyaltyCustomer || redeemPoints <= 0) return;
    const remaining = Math.max(0, subtotalCents - tierDiscountCents - discountCents);
    const rate = loyaltyConfig.redeem_rate_cents || 0;
    const maxUsable =
      rate > 0
        ? Math.min(loyaltyCustomer.loyalty_points, Math.floor(remaining / rate))
        : loyaltyCustomer.loyalty_points;
    if (redeemPoints > maxUsable) {
      setRedeemPoints(maxUsable);
    }
  }, [loyaltyConfig, loyaltyCustomer, redeemPoints, subtotalCents, tierDiscountCents, discountCents]);

  const redeemDiscountCents = useMemo(() => {
    if (!loyaltyConfig?.enabled || !loyaltyCustomer || redeemPoints <= 0) return 0;
    const raw = redeemPoints * loyaltyConfig.redeem_rate_cents;
    const remainAfterDiscount = subtotalCents - tierDiscountCents - discountCents;
    return Math.max(0, Math.min(raw, remainAfterDiscount));
  }, [loyaltyConfig, loyaltyCustomer, redeemPoints, subtotalCents, tierDiscountCents, discountCents]);

  // Goods total after every discount — the tax base. Mirrors the backend POS
  // path, which taxes (subtotal − discount). Tax is never applied to shipping
  // (POS has none) or to packaging beyond what's already in the line subtotal.
  const preTaxTotalCents = Math.max(
    0,
    subtotalCents - tierDiscountCents - discountCents - redeemDiscountCents,
  );

  const taxCents = useMemo(() => {
    if (!taxConfig?.enabled || taxConfig.bps <= 0) return 0;
    return computePOSTaxCents(preTaxTotalCents, taxConfig.bps, taxConfig.inclusive);
  }, [taxConfig, preTaxTotalCents]);

  // Exclusive tax (customer-borne) is added on top; inclusive tax is already
  // inside the goods price, so the total is unchanged (tax shown for info).
  const totalCents =
    taxConfig?.enabled && !taxConfig.inclusive
      ? preTaxTotalCents + taxCents
      : preTaxTotalCents;

  const value: POSContextValue = {
    isTouch,
    session,
    setSession,
    loyaltyConfig,
    setLoyaltyConfig,
    printerConfig,
    setPrinterConfig,
    taxConfig,
    setTaxConfig,
    loyaltyCustomer,
    setLoyaltyCustomer,
    redeemPoints,
    setRedeemPoints,
    midtransLive,
    setMidtransLive,
    offlineEnabled,
    setOfflineEnabled,
    cart,
    addToCart,
    updateQty,
    setQty,
    setItemPrice,
    removeFromCart,
    clearCart,
    loadCart,
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
    preTaxTotalCents,
    taxCents,
    totalCents,
  };

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}

export function usePOS() {
  const ctx = useContext(POSContext);
  if (!ctx) throw new Error("usePOS must be used inside POSProvider");
  return ctx;
}
