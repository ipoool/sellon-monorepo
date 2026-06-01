"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PublicBanner } from "@/lib/types";

const ROTATE_MS = 6000;

// Public-facing seller banner carousel. Two shapes:
//  - default: horizontal 16:5 strip that slides (storefront + table-order).
//  - fill: crossfade that fills its (relative, sized) parent — used full-height
//    on the right half of the customer queue board.
// Renders nothing when there are no banners, so pages stay clean without them.
export function BannerCarousel({
  banners,
  fill = false,
  className,
}: {
  banners: PublicBanner[];
  fill?: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const count = banners.length;
  // Clamp during render so a shrinking banner set never points out of range.
  const safeIndex = count > 0 ? index % count : 0;

  // Auto-rotate; resets when index changes (manual nav).
  useEffect(() => {
    if (count <= 1) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(t);
  }, [index, count]);

  if (count === 0) return null;

  if (fill) {
    return (
      <div className={cn("relative size-full overflow-hidden", className)}>
        {banners.map((b, i) => (
          <Slide key={b.id} banner={b} fill active={i === safeIndex} />
        ))}
        {count > 1 && <Dots count={count} index={safeIndex} onGo={setIndex} />}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-card",
        className,
      )}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${safeIndex * 100}%)` }}
      >
        {banners.map((b) => (
          <Slide key={b.id} banner={b} />
        ))}
      </div>
      {count > 1 && <Dots count={count} index={safeIndex} onGo={setIndex} />}
    </div>
  );
}

function Slide({
  banner,
  fill,
  active,
}: {
  banner: PublicBanner;
  fill?: boolean;
  active?: boolean;
}) {
  const img = fill ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={banner.image_url}
      alt={banner.title || "Banner"}
      className="size-full object-cover"
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={banner.image_url}
      alt={banner.title || "Banner"}
      className="aspect-[16/5] w-full shrink-0 object-cover"
    />
  );

  const wrapperCls = fill
    ? cn(
        "absolute inset-0 transition-opacity duration-700",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )
    : "w-full shrink-0";

  if (banner.link_url) {
    return (
      <a
        href={banner.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className={wrapperCls}
      >
        {img}
      </a>
    );
  }
  return <div className={wrapperCls}>{img}</div>;
}

function Dots({
  count,
  index,
  onGo,
}: {
  count: number;
  index: number;
  onGo: (i: number) => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onGo(i)}
          aria-label={`Banner ${i + 1}`}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === index ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80",
          )}
        />
      ))}
    </div>
  );
}
