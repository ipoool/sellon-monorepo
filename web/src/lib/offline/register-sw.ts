"use client";

// Registers (or removes) the offline service worker.
//
// PRODUCTION ONLY. In `next dev` the service worker would intercept Turbopack's
// HMR/dev chunk requests; that's inherently fragile (the dev server reuses and
// regenerates chunk URLs) and can wedge the page. The SW is a production feature
// — serving the cached app shell for a cold-offline start — so in development we
// instead actively unregister any existing SW and drop its caches, ensuring a
// stale dev registration can never break the dev server's chunk loading.

async function unregisterAll(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("sellon-pos")).map((k) => caches.delete(k)),
      );
    }
  } catch {
    // best-effort
  }
}

export function syncServiceWorker(offlineEnabled: boolean): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const isProd = process.env.NODE_ENV === "production";
  if (offlineEnabled && isProd) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures shouldn't break the POS — just no cold-offline.
    });
  } else {
    // Dev, or offline mode disabled: make sure no SW is left controlling.
    void unregisterAll();
  }
}
