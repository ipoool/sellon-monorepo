"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

// Route-segment error boundary. Catches unexpected runtime errors thrown
// during render/server-action/data-fetch in any non-root segment and
// renders fallback UI. Layout-level errors fall through to
// global-error.tsx instead.
//
// Next.js 16 passes `unstable_retry` (replaces the older `reset`) — it
// re-runs the segment that threw.
export default function GlobalRouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console so devs see the stack while we
    // wire up real error reporting.
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-neutral-50 px-6 py-16">
      <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto w-full max-w-xl text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle className="size-7" aria-hidden />
        </div>
        <p className="mt-6 font-display text-[88px] font-bold leading-none tracking-tight text-gradient-brand sm:text-[112px]">
          500
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          Ada masalah di sisi kami
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-neutral-600">
          Permintaan kamu gagal diproses. Tim kami sudah otomatis ternotifikasi.
          Coba ulangi sebentar lagi — biasanya cuma sebentar.
        </p>

        {error.digest && (
          <p className="mt-4 inline-flex rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-mono text-neutral-600">
            Kode rujukan: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="md" onClick={() => unstable_retry()}>
            <RotateCcw className="size-4" aria-hidden />
            Coba lagi
          </Button>
          <Link href="/">
            <Button size="md" variant="outline">
              <Home className="size-4" aria-hidden />
              Kembali ke beranda
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
