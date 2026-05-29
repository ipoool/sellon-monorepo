"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { POSSession, POSCartItem, SelectedOption } from "@/lib/types";

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

type POSContextValue = {
  // True on touch devices (tablets/phones) — used to hide keyboard
  // shortcut hints (F2/F8) that only make sense with a physical keyboard.
  isTouch: boolean;

  session: POSSession | null;
  setSession: (s: POSSession | null) => void;

  loyaltyConfig: LoyaltyConfig | null;
  setLoyaltyConfig: (c: LoyaltyConfig | null) => void;
  printerConfig: PrinterConfig | null;
  setPrinterConfig: (c: PrinterConfig | null) => void;
  loyaltyCustomer: LoyaltyCustomer | null;
  setLoyaltyCustomer: (c: LoyaltyCustomer | null) => void;
  redeemPoints: number;
  setRedeemPoints: (n: number) => void;

  midtransLive: boolean;
  setMidtransLive: (v: boolean) => void;

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
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<LoyaltyCustomer | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [midtransLive, setMidtransLive] = useState(false);

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

  const totalCents = Math.max(0, subtotalCents - tierDiscountCents - discountCents - redeemDiscountCents);

  const value: POSContextValue = {
    isTouch,
    session,
    setSession,
    loyaltyConfig,
    setLoyaltyConfig,
    printerConfig,
    setPrinterConfig,
    loyaltyCustomer,
    setLoyaltyCustomer,
    redeemPoints,
    setRedeemPoints,
    midtransLive,
    setMidtransLive,
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
    totalCents,
  };

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}

export function usePOS() {
  const ctx = useContext(POSContext);
  if (!ctx) throw new Error("usePOS must be used inside POSProvider");
  return ctx;
}
