"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type QueueData = { store_name: string; preparing: number[]; ready: number[] };

// Public fullscreen queue board (TV/tablet near the counter). Polls every 5s.
export function QueueDisplay({ slug }: { slug: string }) {
  const [data, setData] = useState<QueueData | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/storefront/${slug}/queue`);
        if (res.ok && alive) setData(await res.json());
      } catch {
        /* keep stale */
      }
    };
    load();
    const poll = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [slug]);

  return (
    <div className="flex min-h-svh flex-col bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-8 py-5 text-center">
        <h1 className="font-display text-2xl font-bold">{data?.store_name ?? "Antrian Pesanan"}</h1>
        <p className="text-white/50">Nomor antrian pesanan kamu</p>
      </header>
      <div className="grid flex-1 grid-cols-2 gap-px bg-white/10">
        <Section title="Sedang Disiapkan" numbers={data?.preparing ?? []} tone="amber" />
        <Section title="Siap Diambil" numbers={data?.ready ?? []} tone="emerald" />
      </div>
    </div>
  );
}

function Section({ title, numbers, tone }: { title: string; numbers: number[]; tone: "amber" | "emerald" }) {
  const color = tone === "emerald" ? "text-emerald-400" : "text-amber-400";
  return (
    <div className="flex flex-col bg-neutral-950 p-8">
      <h2 className={`mb-6 text-center text-xl font-semibold ${color}`}>{title}</h2>
      {numbers.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-white/30">—</p>
      ) : (
        <div className="flex flex-wrap content-start justify-center gap-4">
          {numbers.map((n) => (
            <div
              key={n}
              className={`flex size-24 items-center justify-center rounded-2xl bg-white/5 font-display text-4xl font-bold tabular-nums ${color} ${tone === "emerald" ? "animate-pulse" : ""}`}
            >
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
