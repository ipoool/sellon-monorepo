import { PackageSearch } from "lucide-react";

import { StorefrontNotFoundActions } from "@/components/storefront/storefront-not-found-actions";

export const metadata = { title: "Halaman tidak ditemukan" };

// 404 for the public storefront. Deliberately neutral: a storefront can be
// served from the seller's own custom domain, so showing SellOn branding or
// marketing CTAs here would advertise us on the seller's domain.
//
// The chrome mounted by the storefront layout is the cart FAB and the cookie
// banner only — it carries no navigation — so this page used to be a dead end:
// a buyer who mistyped a product URL had nothing to click. StorefrontNotFound-
// Actions works out which store (if any) this URL belongs to and offers that
// store's catalog, falling back to sellon.id only when no store is behind the
// URL at all.
export default function StorefrontNotFound() {
  return (
    <main className="flex min-h-[60svh] items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <PackageSearch className="size-6" aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight text-neutral-900">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Halaman atau produk yang kamu cari sudah tidak tersedia. Coba cek
          kembali linknya, atau lihat produk lain di katalog.
        </p>
        <StorefrontNotFoundActions />
      </div>
    </main>
  );
}
