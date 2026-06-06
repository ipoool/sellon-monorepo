"use client";

import "./snap-types";

// Production Snap.js only — the seller integration is production-only (sandbox
// removed). The sandbox bundle lives at app.sandbox.midtrans.com/snap/snap.js.
const SNAP_SRC = "https://app.midtrans.com/snap/snap.js";
const SCRIPT_ID = "midtrans-snap";

// loadSnap injects Midtrans Snap.js once with the seller's client key and
// resolves when window.snap is ready. If the client key changed since the last
// load, the old script is removed and re-injected. Rejects when the script
// fails to load (typically a wrong / blocked client key).
export function loadSnap(clientKey: string): Promise<NonNullable<Window["snap"]>> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("Snap hanya tersedia di browser"));
      return;
    }

    const ready = () =>
      window.snap ? resolve(window.snap) : reject(new Error("Snap gagal dimuat"));
    const failed = () => reject(new Error("Snap gagal dimuat — periksa Client Key"));

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing && existing.getAttribute("data-client-key") === clientKey) {
      if (window.snap) {
        resolve(window.snap);
        return;
      }
      existing.addEventListener("load", ready, { once: true });
      existing.addEventListener("error", failed, { once: true });
      return;
    }

    // First load, or the client key changed — (re)inject a fresh script.
    if (existing) existing.remove();
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SNAP_SRC;
    s.async = true;
    s.setAttribute("data-client-key", clientKey);
    s.addEventListener("load", ready, { once: true });
    s.addEventListener("error", failed, { once: true });
    document.body.appendChild(s);
  });
}
