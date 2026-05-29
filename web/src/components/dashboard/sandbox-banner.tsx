"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, ArrowRight, X } from "lucide-react";

const STORAGE_KEY = "sbx_banner_dismissed_at";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 minggu

type Props = { visible: boolean };

export function SandboxBanner({ visible }: Props) {
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    if (!visible) {
      setDismissed(true);
      return;
    }
    // Cek timestamp dismiss terakhir. Jika < 7 hari, tetap hidden;
    // jika sudah lewat 7 hari (atau belum pernah di-dismiss), tampilkan.
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const dismissedAt = parseInt(raw, 10);
      if (!Number.isNaN(dismissedAt) && Date.now() - dismissedAt < TTL_MS) {
        setDismissed(true);
        return;
      }
    }
    setDismissed(false);
  }, [visible]);

  if (!visible || dismissed) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-1 border-b border-[oklch(0.86_0.10_75)] bg-[oklch(0.97_0.04_75)] px-4 py-2 text-neutral-800 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex items-center gap-2 text-neutral-900">
        <FlaskConical className="size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-sm font-semibold">Midtrans Mode Sandbox</p>
      </div>
      <p className="flex-1 text-sm">
        Pembayaran saat ini pakai{" "}
        <span className="font-semibold">kunci Sandbox</span> — hanya untuk
        testing, <strong>bukan</strong> untuk transaksi live. Order yang masuk
        lewat checkout tidak akan men-charge pembeli sungguhan.
      </p>
      <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-auto">
        <Link
          href="/settings/payment"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[oklch(0.86_0.10_75)] bg-white px-3 text-sm font-semibold text-neutral-900 transition-colors hover:border-warning hover:bg-[oklch(0.95_0.06_75)]"
        >
          Atur ke Production
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Tutup banner (muncul lagi dalam 1 minggu)"
          className="inline-flex size-8 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-[oklch(0.92_0.06_75)] hover:text-neutral-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
