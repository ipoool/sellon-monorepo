"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PlatformBanner } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROTATE_MS = 6000;

// Promo/info banner slider — fed by platform-managed banners (GET /banners).
// Renders nothing when there are no active banners, so the dashboard stays
// clean for fresh installs.
export function BannerSlider({ banners }: { banners: PlatformBanner[] }) {
  const [index, setIndex] = useState(0);
  const count = banners.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  // Auto-rotate; pause is implicit (interval resets on manual nav via index dep).
  useEffect(() => {
    if (count <= 1) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(t);
  }, [index, count]);

  if (count === 0) return null;

  return (
    <div className="group relative w-full min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-card">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {banners.map((b) => (
          <BannerSlide key={b.id} banner={b} />
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Banner sebelumnya"
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1.5 text-neutral-700 shadow-sm transition-opacity hover:bg-white group-hover:flex"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Banner berikutnya"
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1.5 text-neutral-700 shadow-sm transition-opacity hover:bg-white group-hover:flex"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Banner ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BannerSlide({ banner }: { banner: PlatformBanner }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={banner.image_url}
      alt={banner.title || "Banner SellOn"}
      className="aspect-[16/5] w-full shrink-0 object-cover"
    />
  );
  if (banner.link_url) {
    return (
      <a
        href={banner.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full shrink-0"
      >
        {img}
      </a>
    );
  }
  return <div className="w-full shrink-0">{img}</div>;
}
