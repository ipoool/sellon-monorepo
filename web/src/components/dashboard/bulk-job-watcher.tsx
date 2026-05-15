"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  FileSpreadsheet,
} from "lucide-react";

import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// Auto-dismiss completed/failed toast setelah delay ini. Tidak hapus
// dari backend — backend hanya broadcast event saat state berubah.
const DISMISS_DELAY_MS = 12000;

type Job = {
  id: string;
  kind: string;
  filename: string;
  status: "running" | "completed" | "failed";
  total_rows: number;
  processed_rows: number;
  succeeded: number;
  failed: number;
  errors: { row: number; field: string; message: string }[];
  error_message: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
};

// BulkJobWatcher: mount sekali di DashboardShell. Polling aktif terus
// selama user di area dashboard. Render satu floating card di pojok
// kanan atas per active job. Survive route navigation karena hidup
// di shell layout.
export function BulkJobWatcher() {
  // Map jobs by ID untuk merge incremental update dari SSE — event
  // datang per-job, kita simpan state lengkapnya supaya render rapi.
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Helper: upsert job ke map + schedule auto-dismiss kalau terminal.
  function upsertJob(j: Job) {
    setJobs((prev) => {
      const next = new Map(prev);
      next.set(j.id, j);
      return next;
    });
    if (j.status !== "running" && !dismissTimers.current.has(j.id)) {
      const t = setTimeout(() => {
        setDismissed((p) => new Set(p).add(j.id));
        dismissTimers.current.delete(j.id);
      }, DISMISS_DELAY_MS);
      dismissTimers.current.set(j.id, t);
    }
  }

  // SSE subscription — buka 1 koneksi long-lived ke /bulk/jobs/stream.
  // EventSource auto-reconnect kalau drop. Pengganti polling 2.5s.
  useEffect(() => {
    const es = new EventSource(
      `${apiBase}/api/v1/products/bulk/jobs/stream`,
      { withCredentials: true },
    );

    es.addEventListener("bulk_job.snapshot", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { jobs?: Job[] };
        for (const j of data.jobs ?? []) upsertJob(j);
      } catch {
        // ignore malformed
      }
    });

    const handleJobEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { job?: Job };
        if (data.job) upsertJob(data.job);
      } catch {
        // ignore
      }
    };
    es.addEventListener("bulk_job.progress", handleJobEvent as EventListener);
    es.addEventListener("bulk_job.completed", handleJobEvent as EventListener);
    es.addEventListener("bulk_job.failed", handleJobEvent as EventListener);

    return () => {
      es.close();
    };
  }, []);

  // Cleanup timers on unmount.
  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const visible = Array.from(jobs.values())
    .filter((j) => !dismissed.has(j.id))
    // Newest first
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    const t = dismissTimers.current.get(id);
    if (t) {
      clearTimeout(t);
      dismissTimers.current.delete(id);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3">
      {visible.map((j) => {
        const pct =
          j.total_rows > 0
            ? Math.min(100, Math.round((j.processed_rows / j.total_rows) * 100))
            : 0;
        const isRunning = j.status === "running";
        const isFailed = j.status === "failed";
        const isDone = j.status === "completed";
        const hasErrors = j.failed > 0 || isFailed;
        const isExpanded = expanded.has(j.id);

        return (
          <div
            key={j.id}
            className={cn(
              "pointer-events-auto overflow-hidden rounded-xl border bg-white shadow-popout",
              isFailed
                ? "border-danger/40"
                : isDone && hasErrors
                  ? "border-warning/40"
                  : isDone
                    ? "border-success/40"
                    : "border-brand-200",
            )}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  isFailed
                    ? "bg-danger/15 text-danger"
                    : isDone && hasErrors
                      ? "bg-warning/15 text-neutral-800"
                      : isDone
                        ? "bg-success/15 text-success"
                        : "bg-brand-50 text-brand-700",
                )}
              >
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : isFailed ? (
                  <AlertTriangle className="size-4" aria-hidden />
                ) : hasErrors ? (
                  <AlertTriangle className="size-4" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-semibold text-neutral-900">
                    {isRunning
                      ? "Upload produk berjalan…"
                      : isFailed
                        ? "Upload produk gagal"
                        : hasErrors
                          ? "Upload selesai dengan error"
                          : "Upload produk selesai"}
                  </p>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                  <FileSpreadsheet className="size-3" aria-hidden />
                  <span className="truncate">{j.filename}</span>
                </p>

                {isRunning && (
                  <>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-neutral-600 tabular-nums">
                      {j.processed_rows} / {j.total_rows} baris diproses
                      {j.failed > 0 && (
                        <span className="ml-2 text-danger">
                          ({j.failed} gagal)
                        </span>
                      )}
                    </p>
                  </>
                )}

                {!isRunning && !isFailed && (
                  <p className="mt-1 text-xs text-neutral-600 tabular-nums">
                    {j.succeeded} berhasil
                    {j.failed > 0 && (
                      <span className="ml-1.5 text-danger">
                        · {j.failed} gagal
                      </span>
                    )}
                  </p>
                )}

                {isFailed && j.error_message && (
                  <p className="mt-1 text-xs text-danger">{j.error_message}</p>
                )}

                {!isRunning && j.errors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(j.id)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                  >
                    {isExpanded
                      ? "Sembunyikan detail error"
                      : `Lihat ${j.errors.length} detail error`}
                    <ChevronDown
                      className={cn(
                        "size-3 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(j.id)}
                aria-label="Tutup notifikasi"
                className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>

            {isExpanded && j.errors.length > 0 && (
              <ul className="max-h-48 overflow-y-auto border-t border-neutral-200 bg-neutral-50/50 text-xs">
                {j.errors.map((e, idx) => (
                  <li
                    key={`${e.row}-${e.field}-${idx}`}
                    className="border-b border-neutral-200 px-4 py-2 last:border-b-0"
                  >
                    <span className="font-mono text-[10px] text-danger">
                      Baris {e.row}
                    </span>
                    <span className="ml-1.5 font-medium text-neutral-900">
                      {e.field}:
                    </span>
                    <span className="ml-1 text-neutral-700">{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
