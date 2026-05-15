import Link from "next/link";
import { Home, Search, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Halaman tidak ditemukan" };

export default function NotFound() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-neutral-50 px-6 py-16">
      <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto w-full max-w-xl text-center">
        <p className="font-display text-[120px] font-bold leading-none tracking-tight text-gradient-brand sm:text-[160px]">
          404
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          Halaman tidak ditemukan
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-neutral-600">
          Link yang kamu buka mungkin sudah dipindahkan, salah ketik, atau tidak
          pernah ada. Coba cek URL atau kembali ke beranda.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/">
            <Button size="md">
              <Home className="size-4" aria-hidden />
              Kembali ke beranda
            </Button>
          </Link>
          <Link href="/help">
            <Button size="md" variant="outline">
              <Search className="size-4" aria-hidden />
              Cari di Bantuan
            </Button>
          </Link>
        </div>

        <p className="mt-10 text-xs text-neutral-500">
          Kalau kamu yakin ini bug,{" "}
          <Link
            href="/help"
            className="inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-3 rotate-180" aria-hidden />
            laporkan ke tim kami
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
