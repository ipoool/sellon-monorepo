// SellOn offline service worker (hand-rolled, runtime caching).
//
// Purpose: let the POS page load when the device is fully offline (cold start).
//
// Strategy: same-origin GET is ALWAYS network-first — when online the freshest
// response wins (so a code/deploy/HMR update is picked up immediately), and the
// cache is only a fallback for when the network is unavailable. We deliberately
// do NOT cache-first `/_next/static` even though those URLs are hashed: in dev
// (Turbopack) the URLs can be reused across rebuilds, and a cache-first hit then
// pins stale JS in front of fresh code. Network-first costs one (usually 304 /
// disk-cached) round-trip online and is strictly safer.
//
// Cross-origin requests (the API on another host/port) are left untouched —
// they fail offline by design and are handled by the app's IndexedDB cache +
// order queue. Mutations (non-GET) are never intercepted.
//
// Deliberately hand-rolled (not Serwist) to avoid build-plugin coupling with
// Next.js 16. Bump CACHE when the caching contract changes — `activate` purges
// every cache that isn't the current one.

const CACHE = "sellon-pos-v3";
const PRECACHE = ["/pos"]; // POS shell, so it loads even on a cold offline start

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        // Best-effort: precache the POS shell so the very first offline load
        // works (a normal fetch carries the session cookie for same-origin).
        await cache.addAll(PRECACHE);
      } catch {
        // Ignore — runtime caching will still fill the cache on first visit.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch mutations

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ignore the cross-origin API

  // Everything same-origin: network-first, cache as offline fallback.
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    // Fall back to the cached POS shell for any uncached navigation.
    if (req.mode === "navigate") {
      const pos = await cache.match("/pos");
      if (pos) return pos;
    }
    throw err;
  }
}
