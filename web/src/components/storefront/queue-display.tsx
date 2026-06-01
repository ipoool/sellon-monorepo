"use client";

import { useEffect, useState } from "react";
import { BannerCarousel } from "@/components/storefront/banner-carousel";
import { cn } from "@/lib/utils";
import type { PublicBanner } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type QueueData = { store_name: string; preparing: number[]; ready: number[] };

// Public fullscreen queue board (TV/tablet near the counter). Clean two-pane
// layout: left = queue numbers (Siap Diambil on top, Sedang Disiapkan below),
// right = full-height promo/iklan carousel (customer_queue banners). Queue
// polls every 5s; banners load once.
export function QueueDisplay({ slug }: { slug: string }) {
  const [data, setData] = useState<QueueData | null>(null);
  const [banners, setBanners] = useState<PublicBanner[]>([]);

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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/storefront/${slug}/banners`);
        if (res.ok && alive) {
          const j = (await res.json()) as { customer_queue?: PublicBanner[] };
          setBanners(j.customer_queue ?? []);
        }
      } catch {
        /* no banners is fine */
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const ready = data?.ready ?? [];
  const preparing = data?.preparing ?? [];
  const hasBanners = banners.length > 0;

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-neutral-950 text-white">
      <header className="shrink-0 border-b border-white/10 px-8 py-4 text-center">
        <h1 className="font-display text-xl font-bold sm:text-2xl">
          {data?.store_name ?? "Antrian Pesanan"}
        </h1>
        <p className="text-sm text-white/50">Pantau nomor antrian pesananmu di sini</p>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1",
          hasBanners ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
        )}
      >
        {/* Left: queue numbers */}
        <div className="flex min-h-0 flex-col gap-px bg-white/10">
          <ReadySection numbers={ready} />
          <PreparingSection numbers={preparing} />
        </div>

        {/* Right: full-height promo carousel (only when banners exist) */}
        {hasBanners && (
          <div className="relative hidden min-h-0 bg-neutral-900 lg:block">
            <BannerCarousel banners={banners} fill />
          </div>
        )}
      </div>
    </div>
  );
}

// Siap Diambil — the headline section: big, pulsing, takes the most space.
function ReadySection({ numbers }: { numbers: number[] }) {
  return (
    <div className="flex min-h-0 flex-[3] flex-col bg-neutral-950 p-6 lg:p-8">
      <div className="mb-4 flex shrink-0 items-center justify-center gap-2">
        <span className="inline-block size-3 animate-pulse rounded-full bg-emerald-400" />
        <h2 className="text-center text-lg font-semibold uppercase tracking-wide text-emerald-400 sm:text-xl">
          Siap Diambil
        </h2>
      </div>
      {numbers.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-white/30">
          Belum ada pesanan siap
        </p>
      ) : (
        <div className="flex flex-1 flex-wrap content-center justify-center gap-4 overflow-y-auto">
          {numbers.map((n) => (
            <div
              key={n}
              className="flex size-28 items-center justify-center rounded-3xl bg-emerald-500/15 font-display text-5xl font-bold tabular-nums text-emerald-300 ring-2 ring-emerald-400/40 sm:size-32 sm:text-6xl"
            >
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sedang Disiapkan — the secondary list below, smaller chips.
function PreparingSection({ numbers }: { numbers: number[] }) {
  return (
    <div className="flex min-h-0 flex-[2] flex-col bg-neutral-950 p-6 lg:p-8">
      <h2 className="mb-4 shrink-0 text-center text-base font-semibold uppercase tracking-wide text-amber-400 sm:text-lg">
        Sedang Disiapkan
      </h2>
      {numbers.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-white/30">—</p>
      ) : (
        <div className="flex flex-wrap content-start justify-center gap-3 overflow-y-auto">
          {numbers.map((n) => (
            <div
              key={n}
              className="flex size-16 items-center justify-center rounded-2xl bg-white/5 font-display text-2xl font-bold tabular-nums text-amber-300 sm:size-20 sm:text-3xl"
            >
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
