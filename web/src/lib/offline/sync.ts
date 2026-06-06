"use client";

import { listQueue, removeFromQueue, setQueueStatus } from "./db";
import { isOnline } from "./online";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// How many queued orders to replay concurrently per batch. Bounded so a large
// backlog doesn't fire hundreds of requests at once; idempotency keeps every
// replay safe even if a batch overlaps a previous in-flight attempt.
const BATCH_SIZE = 5;

// Module-level guard: only one sync pass runs at a time within this document.
// (Cross-tab is still deduped by the server's idempotency key.)
let syncing = false;

export type SyncProgress = {
  total: number; // orders this run started with
  synced: number;
  failed: number;
};

export type SyncResult = {
  synced: number; // newly created on the server this run
  failed: number; // permanently rejected this run (kept in queue, flagged)
  remaining: number; // still pending after this run (transient stop / went offline)
};

// A 4xx (except 408/429) is a permanent rejection — retrying won't help, so we
// flag it and move on. Everything else (5xx/408/429/network) is transient.
function isPermanent(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// syncQueue replays queued offline POS orders to the server in bounded batches.
// Each carries its own idempotency_key, so replaying an order the server already
// has is a no-op (returns the existing order) — never a double-charge. A
// transient failure stops the pass and leaves the rest pending for next time; a
// permanent rejection flags that one order "failed" without blocking the others.
// Returns a summary so the caller can surface a background notification.
export async function syncQueue(
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  if (syncing || !isOnline()) {
    return { synced: 0, failed: 0, remaining: await pendingCount() };
  }
  syncing = true;
  let synced = 0;
  let failed = 0;
  let stop = false;
  try {
    // Snapshot only the not-yet-failed entries (failed ones need attention and
    // would otherwise loop forever — they stay in IndexedDB, never lost).
    const pending = (await listQueue()).filter((it) => it.status !== "failed");
    const total = pending.length;
    if (total === 0) return { synced: 0, failed: 0, remaining: 0 };

    for (let i = 0; i < pending.length && !stop; i += BATCH_SIZE) {
      if (!isOnline()) break; // connection dropped between batches
      const batch = pending.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (item) => {
          await setQueueStatus(item.idempotency_key, "syncing");
          try {
            const res = await fetch(`${apiBase}/api/v1/pos/orders`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.payload),
            });
            if (res.ok) {
              await removeFromQueue(item.idempotency_key);
              synced++;
            } else if (isPermanent(res.status)) {
              await setQueueStatus(item.idempotency_key, "failed", `HTTP ${res.status}`);
              failed++;
            } else {
              // Transient — keep pending, back off; the next pass retries.
              await setQueueStatus(item.idempotency_key, "pending");
              stop = true;
            }
          } catch {
            // Network dropped mid-request — keep pending, stop the pass.
            await setQueueStatus(item.idempotency_key, "pending");
            stop = true;
          }
        }),
      );
      onProgress?.({ total, synced, failed });
    }
    return { synced, failed, remaining: await pendingCount() };
  } finally {
    syncing = false;
  }
}

async function pendingCount(): Promise<number> {
  const all = await listQueue();
  return all.filter((it) => it.status !== "failed").length;
}
