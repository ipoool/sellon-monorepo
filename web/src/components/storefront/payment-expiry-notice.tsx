"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

// Live countdown to the order's payment deadline. The backend sends the absolute
// `expiresAt` (created_at + ORDER_EXPIRY_HOURS) only for still-expirable orders.
// `now` stays null until the client mounts, so SSR renders just the static
// deadline (no per-second digits) — no hydration mismatch — and the live clock
// kicks in on the first interval tick (async setState only, no effect-body set).
export function PaymentExpiryNotice({ expiresAt }: { expiresAt: string }) {
  const deadline = new Date(expiresAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  const router = useRouter();
  const refreshedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // A few seconds past the deadline (grace for buyer↔server clock skew), refresh
  // so the server can lazily cancel the order and the page shows the final
  // status — no manual reload. Fires once.
  useEffect(() => {
    if (now !== null && now - deadline >= 3000 && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [now, deadline, router]);

  const deadlineLabel = new Date(deadline).toLocaleString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });

  if (now !== null && deadline - now <= 0) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
        <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
        <div>
          <p className="font-medium text-neutral-900">Batas waktu pembayaran sudah lewat</p>
          <p className="mt-0.5 text-neutral-600">
            Pesanan ini akan dibatalkan otomatis. Muat ulang halaman untuk melihat
            status terbaru, atau buat pesanan baru.
          </p>
        </div>
      </div>
    );
  }

  let countdown: string | null = null;
  if (now !== null) {
    const totalSec = Math.max(0, Math.floor((deadline - now) / 1000));
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    countdown = hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
      <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-neutral-900">Selesaikan pembayaran</p>
        <p className="mt-0.5 text-neutral-600">
          Pilih salah satu metode pembayaran di bawah, lalu klik &apos;Aku sudah
          bayar&apos; setelah selesai.
        </p>
        <p className="mt-1.5 text-neutral-700">
          {countdown && (
            <>
              Sisa waktu:{" "}
              <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                {countdown}
              </span>{" "}
              ·{" "}
            </>
          )}
          Batas bayar <span className="font-medium text-neutral-900">{deadlineLabel} WIB</span> —
          lewat itu pesanan otomatis dibatalkan.
        </p>
      </div>
    </div>
  );
}
