"use client";

import { useSyncExternalStore } from "react";

// Tiny external store so the global CartFab — mounted in the storefront layout,
// a sibling of the page tree — can hide itself while the kiosk fast-checkout is
// active, without threading a context through the server-rendered layout. Only
// one storefront renders per tab, so module-level state is safe here.
let active = false;
const listeners = new Set<() => void>();

export function setKioskActive(v: boolean) {
  if (active === v) return;
  active = v;
  listeners.forEach((l) => l());
}

export function useKioskActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active,
    () => false,
  );
}
