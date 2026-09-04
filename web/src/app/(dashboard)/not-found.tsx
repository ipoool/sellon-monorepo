import Link from "next/link";
import { FileQuestion, LayoutDashboard, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Halaman tidak ditemukan" };

// 404 for the (dashboard) route group — a notFound() from a seller page
// (deleted order, product id that isn't theirs, …) used to fall through to
// the marketing 404 and push the seller back to the public landing page.
export default function DashboardNotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-card">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <FileQuestion className="size-6" aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight text-neutral-900">
          Data tidak ditemukan
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Halaman atau data yang kamu buka sudah dihapus, dipindahkan, atau
          bukan milik tokomu.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild size="md" className="w-full sm:w-auto">
            <Link href="/dashboard">
              <LayoutDashboard className="size-4" aria-hidden />
              Kembali ke dasbor
            </Link>
          </Button>
          <Button asChild size="md" variant="outline" className="w-full sm:w-auto">
            <Link href="/orders">
              <ShoppingBag className="size-4" aria-hidden />
              Lihat pesanan
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
