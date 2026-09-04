"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, CloudOff, X } from "lucide-react";

import { useOnlineStatus } from "@/lib/offline/online";
import { queueCounts, requeueFailed } from "@/lib/offline/db";
import { syncQueue } from "@/lib/offline/sync";
import { cn } from "@/lib/utils";

// How long the "selesai" toast lingers before auto-hiding.
const DISMISS_DELAY_MS = 6000;
// How often we poll the local queue as a backstop (sync also fires immediately
// on reconnect via the `online` effect dependency).
const POLL_MS = 10000;

type Phase = "idle" | "syncing" | "done" | "pending-offline";

type State = {
  phase: Phase;
  total: number;
  synced: number;
  failed: number;
  pendingOffline: number;
};

const IDLE: State = { phase: "idle", total: 0, synced: 0, failed: 0, pendingOffline: 0 };

// OfflineSyncWatcher: mounted once in the dashboard layout so it runs on EVERY
// authenticated page — the cashier can leave the POS screen, switch menus, or
// refresh and queued offline orders still flush in the background. Replays in
// bounded batches (idempotent, so no double-charge) and surfaces an unobtrusive
// status toast. The queue lives in IndexedDB, so nothing is lost on navigation.
export function OfflineSyncWatcher() {
  const online = useOnlineStatus();
  const [state, setState] = useState<State>(IDLE);
  const [dismissed, setDismissed] = useState(false);
  const runningRef = useRef(false);
  const wasOnlineRef = useRef(online);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mount flag lives OUTSIDE the [online] effect. The old per-effect `alive`
  // was flipped false whenever `online` changed, so a pass still in flight when
  // the device dropped offline discarded its own result and left the card stuck
  // on "Menyinkronkan…" forever — a state that hides the close button.
  const mountedRef = useRef(true);
  const requeuedOnMountRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const clearDismissTimer = () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };

    const run = async () => {
      // Give previously-failed orders a fresh attempt on reconnect AND once per
      // mount: an earlier session may have flagged real cash sales on a
      // transient 401/409, and those would otherwise sit failed forever.
      const justReconnected = online && !wasOnlineRef.current;
      wasOnlineRef.current = online;
      if (online && (justReconnected || !requeuedOnMountRef.current)) {
        requeuedOnMountRef.current = true;
        await requeueFailed();
      }

      if (!online) {
        // Offline: reassure the user their queued sales are safe on-device.
        const { active } = await queueCounts();
        if (!mountedRef.current) return;
        setState((p) =>
          active > 0
            ? { ...IDLE, phase: "pending-offline", pendingOffline: active }
            : p.phase === "done"
              ? p
              : IDLE,
        );
        return;
      }

      if (runningRef.current) return; // a pass is already in flight
      const { active } = await queueCounts();
      if (!mountedRef.current) return;
      if (active === 0) {
        setState((p) => (p.phase === "done" ? p : IDLE));
        return;
      }

      runningRef.current = true;
      clearDismissTimer();
      setDismissed(false);
      setState({ ...IDLE, phase: "syncing", total: active });
      try {
        const result = await syncQueue((p) => {
          if (mountedRef.current)
            setState((s) => ({
              ...s,
              phase: "syncing",
              total: p.total,
              synced: p.synced,
              failed: p.failed,
            }));
        });
        if (!mountedRef.current) return;
        if (result.synced === 0 && result.failed === 0) {
          // Nothing actually moved (went offline immediately, or another tab
          // drained it) — the finally below drops back to ambient state.
          return;
        }
        setState({
          phase: "done",
          total: result.synced + result.failed,
          synced: result.synced,
          failed: result.failed,
          pendingOffline: result.remaining,
        });
        dismissTimer.current = setTimeout(() => {
          if (mountedRef.current) setState((p) => (p.phase === "done" ? IDLE : p));
        }, DISMISS_DELAY_MS);
      } finally {
        runningRef.current = false;
        // Never leave the card pinned on "syncing" — that phase hides the close
        // button. Whatever the try block already set (done / pending-offline)
        // wins, since this only resets a still-syncing phase.
        setState((p) => (p.phase === "syncing" ? IDLE : p));
      }
    };

    void run();
    const iv = setInterval(() => void run(), POLL_MS);
    // A backgrounded tab throttles timers, so kick a pass the moment it comes
    // back rather than making the cashier wait out the poll interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      clearDismissTimer();
    };
  }, [online]);

  if (state.phase === "idle" || dismissed) return null;

  const isSyncing = state.phase === "syncing";
  const isDone = state.phase === "done";
  const isPending = state.phase === "pending-offline";
  const hasFailed = state.failed > 0;
  const pct =
    state.total > 0
      ? Math.min(100, Math.round(((state.synced + state.failed) / state.total) * 100))
      : 0;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))]">
      <div
        className={cn(
          "pointer-events-auto overflow-hidden rounded-xl border bg-white shadow-popout",
          isSyncing
            ? "border-brand-200"
            : isDone && hasFailed
              ? "border-warning/40"
              : isDone
                ? "border-success/40"
                : "border-neutral-200",
        )}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              isSyncing
                ? "bg-brand-50 text-brand-700"
                : isDone && hasFailed
                  ? "bg-warning/15 text-neutral-800"
                  : isDone
                    ? "bg-success/15 text-success"
                    : "bg-neutral-100 text-neutral-500",
            )}
          >
            {isSyncing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : isDone && hasFailed ? (
              <AlertTriangle className="size-4" aria-hidden />
            ) : isDone ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <CloudOff className="size-4" aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">
              {isSyncing
                ? "Menyinkronkan transaksi offline…"
                : isDone && hasFailed
                  ? "Sebagian transaksi belum tersinkron"
                  : isDone
                    ? "Sinkronisasi selesai"
                    : "Transaksi offline tersimpan"}
            </p>

            {isSyncing && (
              <>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs tabular-nums text-neutral-600">
                  {state.synced + state.failed} / {state.total} diproses
                </p>
              </>
            )}

            {isDone && (
              <p className="mt-0.5 text-xs text-neutral-600 tabular-nums">
                {state.synced} transaksi tersimpan ke server
                {hasFailed && (
                  <span className="ml-1.5 text-danger">· {state.failed} perlu dicek</span>
                )}
              </p>
            )}

            {isPending && (
              <p className="mt-0.5 text-xs text-neutral-600">
                {state.pendingOffline} transaksi aman di perangkat ini — otomatis
                tersinkron saat internet kembali.
              </p>
            )}
          </div>

          {!isSyncing && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Tutup notifikasi"
              className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
