import { PackageSearch } from "lucide-react";

export const metadata = { title: "Halaman tidak ditemukan" };

// 404 for the public storefront. Deliberately neutral: a storefront can be
// served from the seller's own custom domain, so showing SellOn branding or
// marketing CTAs here would advertise us on the seller's domain. No links
// out either — the storefront chrome from the layout already provides
// navigation back into the seller's own catalog.
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
      </div>
    </main>
  );
}
