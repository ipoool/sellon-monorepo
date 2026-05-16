"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Wraps all sticky banners and measures the rendered height via ResizeObserver.
// Sets --banners-h on the root div so the dashboard shell header can use it
// as the sticky `top` offset — no more hardcoded rem guesswork.
export function BannersWrapper({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      document.documentElement.style.setProperty(
        "--banners-h",
        `${el.offsetHeight}px`,
      );
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--banners-h", "0px");
    };
  }, []);

  return (
    <div ref={ref} className="sticky top-0 z-[60]">
      {children}
    </div>
  );
}
