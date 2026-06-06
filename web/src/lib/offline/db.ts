"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Product, Category, POSCartItem, POSSession } from "@/lib/types";

// Local-first store for the offline POS. Holds the cached catalog (so the
// cashier can sell with no network), the in-progress cart/shift (survives
// refresh), and a queue of orders created offline that the sync engine
// replays on reconnect. All helpers no-op gracefully when IndexedDB is
// unavailable (SSR / private mode) so callers don't need to guard.

const DB_NAME = "sellon-pos";
const DB_VERSION = 1;
const CART_ID = "current";

export type QueuedOrder = {
  idempotency_key: string; // also the IndexedDB key — one queue entry per order
  payload: unknown; // the /pos/orders request body (already has idempotency_key + offline:true)
  local_number: string; // temporary receipt number shown while offline
  total_cents: number;
  status: "pending" | "syncing" | "failed";
  error?: string;
  created_at: number;
};

export type PosCartState = {
  cart: POSCartItem[];
  customerName: string;
  customerWA: string;
  discount: { type: "percent" | "fixed" | null; value: number };
  redeemPoints: number;
  // Deprecated: the active shift is now persisted under its own meta key
  // (saveActiveSession) so a cart write can never null it out. Kept optional so
  // older cached payloads still read cleanly.
  session?: POSSession | null;
};

interface PosDB extends DBSchema {
  products: { key: string; value: Product };
  categories: { key: string; value: Category };
  meta: { key: string; value: unknown };
  pos_cart: { key: string; value: PosCartState & { id: string } };
  pos_order_queue: { key: string; value: QueuedOrder };
}

let dbPromise: Promise<IDBPDatabase<PosDB>> | null = null;

function db(): Promise<IDBPDatabase<PosDB>> | null {
  if (typeof indexedDB === "undefined") return null; // SSR / unsupported
  if (!dbPromise) {
    dbPromise = openDB<PosDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("products"))
          d.createObjectStore("products", { keyPath: "id" });
        if (!d.objectStoreNames.contains("categories"))
          d.createObjectStore("categories", { keyPath: "id" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
        if (!d.objectStoreNames.contains("pos_cart"))
          d.createObjectStore("pos_cart", { keyPath: "id" });
        if (!d.objectStoreNames.contains("pos_order_queue"))
          d.createObjectStore("pos_order_queue", { keyPath: "idempotency_key" });
      },
    });
  }
  return dbPromise;
}

// ── Catalog ──────────────────────────────────────────────────────────────
export async function cacheCatalog(products: Product[], categories: Category[]): Promise<void> {
  const d = await db();
  if (!d) return;
  const tx = d.transaction(["products", "categories"], "readwrite");
  await tx.objectStore("products").clear();
  for (const p of products) await tx.objectStore("products").put(p);
  await tx.objectStore("categories").clear();
  for (const c of categories) await tx.objectStore("categories").put(c);
  await tx.done;
}

export async function getCachedProducts(): Promise<Product[]> {
  const d = await db();
  return d ? d.getAll("products") : [];
}

export async function getCachedCategories(): Promise<Category[]> {
  const d = await db();
  return d ? d.getAll("categories") : [];
}

// ── Cart / shift ─────────────────────────────────────────────────────────
export async function saveCart(state: PosCartState): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.put("pos_cart", { ...state, id: CART_ID });
}

export async function loadCart(): Promise<PosCartState | null> {
  const d = await db();
  if (!d) return null;
  return (await d.get("pos_cart", CART_ID)) ?? null;
}

export async function clearCart(): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.delete("pos_cart", CART_ID);
}

// ── Active shift ───────────────────────────────────────────────────────────
// Persisted under its own meta key with explicit open/close semantics so a
// cold offline reload can resume the cashier's shift — and so the frequent cart
// writes can never accidentally null it out (the bug that stranded sellers on
// the "Belum ada shift aktif" screen offline).
const ACTIVE_SESSION_KEY = "pos_active_session";

export async function saveActiveSession(session: POSSession | null): Promise<void> {
  const d = await db();
  if (!d) return;
  if (session) await d.put("meta", session, ACTIVE_SESSION_KEY);
  else await d.delete("meta", ACTIVE_SESSION_KEY);
}

export async function loadActiveSession(): Promise<POSSession | null> {
  const d = await db();
  if (!d) return null;
  return ((await d.get("meta", ACTIVE_SESSION_KEY)) as POSSession | undefined) ?? null;
}

// ── Offline order queue ────────────────────────────────────────────────────
export async function enqueueOrder(item: QueuedOrder): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.put("pos_order_queue", item);
}

export async function listQueue(): Promise<QueuedOrder[]> {
  const d = await db();
  if (!d) return [];
  const all = await d.getAll("pos_order_queue");
  return all.sort((a, b) => a.created_at - b.created_at);
}

export async function removeFromQueue(key: string): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.delete("pos_order_queue", key);
}

export async function setQueueStatus(
  key: string,
  status: QueuedOrder["status"],
  error?: string,
): Promise<void> {
  const d = await db();
  if (!d) return;
  const it = await d.get("pos_order_queue", key);
  if (it) await d.put("pos_order_queue", { ...it, status, error });
}

export async function queueCount(): Promise<number> {
  const d = await db();
  return d ? d.count("pos_order_queue") : 0;
}

// Flip every "failed" entry back to "pending" so the sync engine gives them a
// fresh attempt — called on a reconnect, when a transient cause (expired
// session, server hiccup) has likely cleared. Returns how many were requeued.
export async function requeueFailed(): Promise<number> {
  const d = await db();
  if (!d) return 0;
  const all = await d.getAll("pos_order_queue");
  let n = 0;
  for (const it of all) {
    if (it.status === "failed") {
      await d.put("pos_order_queue", { ...it, status: "pending", error: undefined });
      n++;
    }
  }
  return n;
}

// Split the queue count by state so the UI can show orders still waiting to sync
// ("active") separately from ones that hit a permanent rejection ("failed") and
// need the seller's attention — otherwise a stuck failed order looks like a
// normal pending one forever.
export async function queueCounts(): Promise<{ active: number; failed: number }> {
  const d = await db();
  if (!d) return { active: 0, failed: 0 };
  const all = await d.getAll("pos_order_queue");
  let active = 0;
  let failed = 0;
  for (const it of all) {
    if (it.status === "failed") failed++;
    else active++;
  }
  return { active, failed };
}

// ── Config snapshots (tax/loyalty/printer) ─────────────────────────────────
export async function setMeta(key: string, val: unknown): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.put("meta", val, key);
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const d = await db();
  if (!d) return null;
  return ((await d.get("meta", key)) as T | undefined) ?? null;
}
