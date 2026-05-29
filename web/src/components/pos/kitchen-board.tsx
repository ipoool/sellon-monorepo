"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import type { KitchenOrder } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const columns: { key: KitchenOrder["kitchen_status"]; label: string; accent: string }[] = [
  { key: "queued", label: "Antrian", accent: "border-amber-400" },
  { key: "preparing", label: "Disiapkan", accent: "border-blue-400" },
  { key: "ready", label: "Siap Diantar", accent: "border-emerald-400" },
];

const nextLabel: Record<string, string> = {
  queued: "Mulai Masak",
  preparing: "Tandai Siap",
  ready: "Selesai / Antar",
};

function elapsed(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "baru";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}j ${mins % 60}m`;
}

export function KitchenBoard({ initial }: { initial: KitchenOrder[] }) {
  const [orders, setOrders] = useState<KitchenOrder[]>(initial);
  const [, setTick] = useState(0); // re-render for elapsed timers
  const busyRef = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/kds/orders`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } catch {
      /* keep stale on error */
    }
  }, []);

  // Realtime via SSE; refetch on any kitchen event. Poll fallback every 15s
  // (broker is single-instance, so a missed event self-heals).
  useEffect(() => {
    const es = new EventSource(`${apiBase}/api/v1/kds/stream`, { withCredentials: true });
    const onEvent = () => refetch();
    es.addEventListener("kds.order.created", onEvent);
    es.addEventListener("kds.order.bumped", onEvent);
    es.addEventListener("queue.updated", onEvent);
    const poll = setInterval(refetch, 15000);
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      es.close();
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [refetch]);

  const bump = async (id: string) => {
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id);
    try {
      await fetch(`${apiBase}/api/v1/kds/orders/${id}/bump`, { method: "POST", credentials: "include" });
      await refetch();
    } finally {
      busyRef.current.delete(id);
    }
  };

  return (
    <div className="flex h-svh flex-col bg-neutral-900 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <ChefHat className="size-5 text-brand-400" aria-hidden />
          <h1 className="font-display text-lg font-semibold">Kitchen Display</h1>
        </div>
        <span className="text-sm text-white/50">{orders.length} pesanan aktif</span>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 sm:grid-cols-3">
        {columns.map((col) => {
          const list = orders.filter((o) => o.kitchen_status === col.key);
          return (
            <div key={col.key} className="flex min-h-0 flex-col rounded-xl bg-white/5">
              <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
                <span>{col.label}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{list.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {list.map((o) => (
                  <div key={o.order_id} className={`rounded-lg border-l-4 ${col.accent} bg-neutral-800 p-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-lg font-bold">
                          #{o.queue_number ?? "—"}
                          <span className="ml-2 text-xs font-normal text-white/50">
                            {o.serving_type === "dine_in" ? "Dine In" : o.serving_type === "takeaway" ? "Take Away" : ""}
                            {o.table_label ? ` · Meja ${o.table_label}` : ""}
                          </span>
                        </p>
                        <p className="text-xs text-white/40">{o.order_number}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-white/50">
                        <Clock className="size-3" aria-hidden />
                        {elapsed(o.created_at)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {o.items.map((it, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{it.name}</span>
                          <span className="text-white/60">×{it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => bump(o.order_id)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
                    >
                      {col.key === "ready" ? <CheckCircle2 className="size-4" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                      {nextLabel[col.key]}
                    </button>
                  </div>
                ))}
                {list.length === 0 && <p className="px-2 py-6 text-center text-sm text-white/30">Kosong</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
