"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── finish: run the bar to 100% and fade it out ───────────────────────
  // Shared by the route-commit effect and the stall safety net, so there is
  // exactly one place that can clear the "running" state.
  const finish = useCallback(() => {
    if (!running.current) return; // nothing in flight (e.g. initial mount)
    running.current = false;
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
    if (stallTimer.current) {
      clearTimeout(stallTimer.current);
      stallTimer.current = null;
    }
    setWidth(100);
    hideTimer.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 240);
  }, []);

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
      // Safety net: if no route commit ever arrives (aborted navigation, a
      // history entry Next never renders, a failed prefetch) the bar would
      // otherwise sit frozen at ~90% forever. Force it to complete.
      if (stallTimer.current) clearTimeout(stallTimer.current);
      stallTimer.current = setTimeout(finish, 10000);
    };

    // Next's router calls history.pushState from inside a useInsertionEffect,
    // where scheduling React state updates synchronously is forbidden. So we
    // run the original first, then defer start() to a microtask — moving the
    // setState out of the insertion-effect phase.
    const schedule = () => queueMicrotask(start);

    // Next calls history.replaceState on EVERY router state commit —
    // router.refresh(), server-action revalidation, same-URL navigation. Those
    // never change pathname/searchParams, so the finish effect below never
    // fires and the bar stays stuck. Only start when the target URL actually
    // differs from where we already are.
    const changesUrl = (url: unknown, from: string): boolean => {
      if (url === null || url === undefined) return false; // state-only update
      try {
        return new URL(String(url), from).href !== from;
      } catch {
        return false;
      }
    };

    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      // Compare BEFORE the original runs — it mutates location synchronously.
      const navigating = changesUrl(args[2], location.href);
      const res = origPush.apply(this, args as Parameters<typeof origPush>);
      if (navigating) schedule();
      return res;
    };
    history.replaceState = function (...args) {
      const navigating = changesUrl(args[2], location.href);
      const res = origReplace.apply(this, args as Parameters<typeof origReplace>);
      if (navigating) schedule();
      return res;
    };
    window.addEventListener("popstate", schedule);

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", schedule);
      if (trickle.current) clearInterval(trickle.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (stallTimer.current) clearTimeout(stallTimer.current);
    };
  }, [finish]);

  // ── the new route has rendered ────────────────────────────────────────
  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

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
