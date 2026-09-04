// Thin wrapper around the Meta Pixel `fbq` global. No-ops when the Pixel base
// script isn't loaded (store hasn't enabled Meta), so call sites stay simple.
// All money values are in IDR (Rupiah), matching the catalog feed + CAPI.

type FbqContent = { id: string; quantity: number; item_price?: number };

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Cookie-consent gate. Mirrors CONSENT_KEY in components/storefront/cookie-consent
// (duplicated as a literal so this module stays free of React imports). The base
// Pixel script is only mounted after consent, but a stale `window.fbq` can
// survive a "Tolak" click in the same tab — so every track call re-checks.
function consentGranted(): boolean {
  try {
    return localStorage.getItem("sellon:cookie-consent") === "accepted";
  } catch {
    return false;
  }
}

function fbq(...args: unknown[]) {
  if (typeof window === "undefined" || !consentGranted()) return;
  if (typeof window.fbq === "function") {
    window.fbq(...args);
  }
}

export function trackViewContent(productId: string, valueRupiah: number) {
  fbq("track", "ViewContent", {
    content_type: "product",
    content_ids: [productId],
    currency: "IDR",
    value: valueRupiah,
  });
}

export function trackAddToCart(productId: string, valueRupiah: number, quantity = 1) {
  fbq("track", "AddToCart", {
    content_type: "product",
    content_ids: [productId],
    contents: [{ id: productId, quantity }],
    currency: "IDR",
    value: valueRupiah,
  });
}

export function trackInitiateCheckout(contents: FbqContent[], valueRupiah: number) {
  fbq("track", "InitiateCheckout", {
    content_type: "product",
    content_ids: contents.map((c) => c.id),
    contents,
    currency: "IDR",
    value: valueRupiah,
    num_items: contents.reduce((s, c) => s + c.quantity, 0),
  });
}

// Purchase carries an explicit eventID = order_number so Meta deduplicates this
// browser event against the authoritative server-side Conversions API event.
export function trackPurchase(
  orderNumber: string,
  contents: FbqContent[],
  valueRupiah: number,
) {
  fbq(
    "track",
    "Purchase",
    {
      content_type: "product",
      content_ids: contents.map((c) => c.id),
      contents,
      currency: "IDR",
      value: valueRupiah,
    },
    { eventID: orderNumber },
  );
}
