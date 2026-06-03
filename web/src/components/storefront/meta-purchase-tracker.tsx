"use client";

import { useEffect, useRef } from "react";
import { trackPurchase } from "@/lib/meta-pixel";

type Item = { product_id?: string; quantity: number; unit_price_cents: number };

// Fires the browser Pixel Purchase for a PAID order, at most once per order
// (persisted in localStorage so a refresh / bookmark revisit beyond Meta's
// dedup window never re-fires). eventID = order_number so Meta also dedupes
// against the authoritative server-side Conversions API event. No-ops when the
// Pixel isn't loaded.
export function MetaPurchaseTracker({
  orderNumber,
  totalCents,
  items,
}: {
  orderNumber: string;
  totalCents: number;
  items: Item[];
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const key = `meta_purchase_${orderNumber}`;
    try {
      if (localStorage.getItem(key) === "1") return; // already counted
    } catch {
      /* private mode — fall through, eventID dedup still protects */
    }
    const contents = items
      .filter((it) => it.product_id)
      .map((it) => ({
        id: it.product_id as string,
        quantity: it.quantity,
        item_price: it.unit_price_cents / 100,
      }));
    trackPurchase(orderNumber, contents, totalCents / 100);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [orderNumber, totalCents, items]);
  return null;
}
