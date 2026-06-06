"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

import { usePOS } from "./pos-context";
import { useOnlineStatus } from "@/lib/offline/online";
import { queueCounts } from "@/lib/offline/db";
import { cn } from "@/lib/utils";

// Shows connectivity + how many offline orders are waiting to sync. Display
// only — the actual flushing is driven globally by OfflineSyncWatcher (mounted
// in the dashboard layout) so it keeps running after the cashier leaves /pos.
// Renders nothing unless offline mode is enabled for the store.
export function OfflineIndicator() {
  const { offlineEnabled } = usePOS();
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    if (!offlineEnabled) return;
    let alive = true;
    const tick = async () => {
      // Best-effort counters; never let an IndexedDB error escape as an
      // unhandled rejection.
      try {
        const { active, failed } = await queueCounts();
        if (alive) {
          setPending(active);
          setFailed(failed);
        }
      } catch {
        // swallow — transient; refreshed on the next tick
      }
    };
    void tick();
    const iv = setInterval(() => void tick(), 8000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [offlineEnabled, online]);

  if (!offlineEnabled) return null;

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          online ? "bg-success/10 text-success" : "bg-warning/15 text-warning",
        )}
      >
        {online ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
        {online ? "Online" : "Offline"}
      </span>
      {pending > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
          <RefreshCw className={cn("size-3.5", online && "animate-spin")} aria-hidden />
          {pending} nunggu sync
        </span>
      )}
      {failed > 0 && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger"
          title="Transaksi ini gagal tersinkron (mis. shift sudah ditutup). Hubungi admin / cek pesanan."
        >
          <WifiOff className="size-3.5" aria-hidden />
          {failed} gagal sync
        </span>
      )}
    </div>
  );
}
