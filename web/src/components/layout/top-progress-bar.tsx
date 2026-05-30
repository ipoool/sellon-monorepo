"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Thin top loading bar shown during route navigation (YouTube/nprogress style),
// so users get feedback while a page is being fetched/rendered. No dependency —
// it detects navigation START by patching history.pushState/replaceState (which
// both <Link> clicks and router.push() go through) + popstate for back/forward,
// and navigation END when the rendered pathname/searchParams change.
export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);

  const running = useRef(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // ── start: begin/refresh the progress animation ──────────────────────
    const start = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      running.current = true;
      setActive(true);
      setWidth(8);
      if (trickle.current) clearInterval(trickle.current);
      // Ease towards 90% and stall there until the route commits.
      trickle.current = setInterval(() => {
        setWidth((w) => (w < 90 ? w + Math.max(0.4, (90 - w) / 14) : w));
      }, 220);
    };

    // Patch history so both <Link> and programmatic router.push() trigger us.
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      start();
      return origPush.apply(this, args as Parameters<typeof origPush>);
    };
    history.replaceState = function (...args) {
      start();
      return origReplace.apply(this, args as Parameters<typeof origReplace>);
    };
    window.addEventListener("popstate", start);

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", start);
      if (trickle.current) clearInterval(trickle.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // ── finish: the new route has rendered ────────────────────────────────
  useEffect(() => {
    if (!running.current) return; // skip the initial mount (no navigation)
    running.current = false;
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
    setWidth(100);
    hideTimer.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!active && width === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5"
      style={{ opacity: active ? 1 : 0, transition: "opacity 240ms ease" }}
    >
      <div
        className="h-full rounded-r-full bg-brand-600 shadow-[0_0_10px_1px] shadow-brand-500/60"
        style={{ width: `${width}%`, transition: "width 220ms ease-out" }}
      />
    </div>
  );
}
