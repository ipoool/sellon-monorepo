import type { ReactNode } from "react";

import { CartProvider } from "@/components/storefront/cart-context";
import { StorefrontChrome } from "@/components/storefront/storefront-chrome";

type Params = Promise<{ slug: string }>;

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

// Fetch just enough to know whether to mount the Meta Pixel. Uses the exact
// same URL + options as the page's fetchStorefront, so on catalog/product/cart/
// checkout routes Next request-memoization collapses it into the page's call.
// (The order route fetches a different URL, so there it's one extra lightweight
// public GET — acceptable; the Pixel matters least there.)
async function fetchPixelId(slug: string): Promise<string> {
  try {
    const res = await fetch(`${apiBase}/api/v1/storefront/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { store?: { meta_pixel_id?: string } };
    return data.store?.meta_pixel_id ?? "";
  } catch {
    return "";
  }
}

// Wrapping every storefront route under a single CartProvider lets the
// product page, cart page, and checkout share state without prop-drilling
// or refetching. Cart state lives in localStorage keyed by store slug,
// so opening two different stores in tabs gives each its own cart.
export default async function StorefrontLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { slug } = await params;
  const pixelId = await fetchPixelId(slug);
  return (
    <CartProvider storeSlug={slug}>
      {children}
      {/* Pixel + cart FAB + cookie banner. Consent-gated and hidden on the
          private course viewer — see StorefrontChrome. */}
      <StorefrontChrome storeSlug={slug} pixelId={pixelId} />
    </CartProvider>
  );
}
