import type { ReactNode } from "react";

import { CartProvider } from "@/components/storefront/cart-context";
import { CartFab } from "@/components/storefront/cart-fab";

type Params = Promise<{ slug: string }>;

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
  return (
    <CartProvider storeSlug={slug}>
      {children}
      <CartFab storeSlug={slug} />
    </CartProvider>
  );
}
