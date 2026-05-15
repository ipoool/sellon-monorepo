"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { useCart } from "./cart-context";

type Props = {
  storeSlug: string;
};

// Floating action button — fixed bottom-right of the viewport on every
// storefront page. Hidden when the cart is empty so it doesn't crowd
// the catalog before the buyer has put anything in. The badge count
// updates live via the CartProvider context.
export function CartFab({ storeSlug }: Props) {
  const { count } = useCart();
  if (count === 0) return null;

  return (
    <Link
      href={`/${storeSlug}/cart`}
      aria-label={`Buka keranjang (${count} item)`}
      // Compact icon-only on mobile so the FAB doesn't overlap the
      // page's own CTAs (e.g. "Tambah ke Keranjang" at the end of the
      // product checkout form). Expands to icon+label on sm+ where there
      // is room.
      className="fixed bottom-4 right-4 z-40 inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 p-3 text-sm font-semibold text-white shadow-popout transition-all hover:-translate-y-0.5 hover:bg-brand-700 sm:bottom-6 sm:right-6 sm:px-5 sm:py-3"
    >
      <ShoppingCart className="size-5" aria-hidden />
      <span className="hidden sm:inline">Keranjang</span>
      <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-brand-700 shadow-card ring-2 ring-brand-600 sm:static sm:min-w-6 sm:bg-white/95 sm:px-1.5 sm:text-xs sm:shadow-none sm:ring-0">
        {count}
      </span>
    </Link>
  );
}
