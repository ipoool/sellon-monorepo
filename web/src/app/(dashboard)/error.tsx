"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, LayoutDashboard, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

// Error boundary for the (dashboard) route group. Without it, anything
// thrown inside the seller dasbor bubbled up to the root app/error.tsx and
// rendered the MARKETING 500 page ("Kembali ke beranda") — dropping the
// seller out of the app entirely.
//
// Next.js 16 passes `unstable_retry` (replaces the older `reset`) — it
// re-runs the segment that threw, so a transient API failure recovers
// without a full reload.
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[(dashboard)/error.tsx]", error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-card">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle className="size-6" aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight text-neutral-900">
          Halaman ini gagal dimuat
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Ada kendala saat mengambil data tokomu. Datamu aman — coba muat
          ulang halaman ini sebentar lagi.
        </p>

        {error.digest && (
          <p className="mt-4 inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 font-mono text-xs text-neutral-600">
            Kode rujukan: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            size="md"
            onClick={() => unstable_retry()}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="size-4" aria-hidden />
            Coba lagi
          </Button>
          <Button asChild size="md" variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard">
              <LayoutDashboard className="size-4" aria-hidden />
              Kembali ke dasbor
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
