"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, X } from "lucide-react";

import { formatRupiah } from "@/lib/format";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type IncomingOrder = {
  order_id: string;
  order_number: string;
  customer_name: string;
  total_cents: number;
  created_at: string;
};

type Toast = IncomingOrder & { ts: number };

// Lightweight chime so the seller hears something when an order lands.
// Uses WebAudio so we don't need an asset file. Returns a callable.
function chime(): () => void {
  return () => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
      // Two-note ding: schedule second tone slightly higher.
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.value = 1320;
      gain2.gain.setValueAtTime(0.001, ctx.currentTime + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc2.start(ctx.currentTime + 0.18);
      osc2.stop(ctx.currentTime + 0.65);
    } catch {
      // ignore — audio is best-effort
    }
  };
}

export function OrderNotifier() {
  const { refresh } = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const playChime = chime();
    let es: EventSource | null = null;
    let backoff = 1000;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      es = new EventSource(`${apiBase}/api/v1/orders/stream`, {
        withCredentials: true,
      });
      es.addEventListener("hello", () => {
        backoff = 1000;
      });
      es.addEventListener("order.created", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as IncomingOrder;
          setToasts((prev) => [{ ...data, ts: Date.now() }, ...prev].slice(0, 4));
          playChime();
          // Refresh server components on the current page so list views
          // reflect the new order without manual reload.
          refresh();
        } catch {
          // ignore
        }
      });
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
    }

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [refresh]);

  // Auto-dismiss each toast after 8 seconds.
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => {
      setToasts((prev) => prev.slice(0, -1));
    }, 8000);
    return () => clearTimeout(t);
  }, [toasts]);

  function dismiss(ts: number) {
    setToasts((prev) => prev.filter((t) => t.ts !== ts));
  }

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3 sm:right-4 sm:left-auto sm:top-4 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.ts}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-brand-300 bg-white p-4 shadow-popout animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Bell className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">
              Pesanan baru masuk!
            </p>
            <p className="truncate text-xs text-neutral-600">
              {t.customer_name} · {t.order_number}
            </p>
            <p className="font-display text-sm font-semibold text-neutral-900">
              {formatRupiah(t.total_cents)}
            </p>
            <Link
              href={`/orders/${t.order_id}`}
              className="mt-1 inline-flex text-xs font-medium text-brand-600 hover:text-brand-700"
              onClick={() => dismiss(t.ts)}
            >
              Lihat detail →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.ts)}
            aria-label="Tutup notifikasi"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
