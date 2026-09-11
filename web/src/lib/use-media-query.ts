"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query from React.
 *
 * Tailwind's responsive classes only HIDE the layout that doesn't apply — both
 * the mobile and the desktop markup stay mounted. That is fine for plain
 * presentation, but anything that must exist exactly ONCE per page (a menu that
 * owns dialogs, an element with an id, a component holding its own state)
 * cannot be duplicated across the two layouts. This hook lets the caller mount
 * such a thing in the layout the viewport is actually showing.
 *
 * The server snapshot is `false` — Tailwind's mobile-first default — so the
 * markup Next.js streams matches a phone, and a desktop viewport pays one extra
 * render right after hydration instead of a hydration mismatch. Phones, which
 * hydrate slowest, therefore never see the control missing.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
