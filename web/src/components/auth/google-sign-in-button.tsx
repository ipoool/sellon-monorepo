"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "@/lib/auth-types";
import { showError } from "@/lib/toast";

const GIS_SRC = "https://accounts.google.com/gsi/client";

// Loads the GIS client via direct DOM injection (not next/script). The
// Next.js Script component sometimes doesn't actually inject its
// `<script>` tag in dev mode through ngrok / under aggressive content
// scripts (MetaMask SES, Brave shields, etc.) — falling back to
// vanilla DOM bypasses those.
function loadGISScript(onReady: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (window.google?.accounts?.id) {
    onReady();
    return () => {};
  }
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-sellon-gis="1"]',
  );
  if (existing) {
    if (existing.dataset.loaded === "1") {
      onReady();
      return () => {};
    }
    existing.addEventListener("load", onReady, { once: true });
    return () => existing.removeEventListener("load", onReady);
  }
  const s = document.createElement("script");
  s.src = GIS_SRC;
  s.async = true;
  s.defer = true;
  s.dataset.sellonGis = "1";
  s.addEventListener(
    "load",
    () => {
      s.dataset.loaded = "1";
      onReady();
    },
    { once: true },
  );
  document.head.appendChild(s);
  return () => s.removeEventListener("load", onReady);
}

export function GoogleSignInButton({ inviteCode }: { inviteCode?: string }) {
  const { push, refresh } = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  // Inject the GIS client via vanilla DOM so the script reliably
  // loads regardless of Next.js Script timing or extension
  // hardening that intercepts the framework's loader.
  useEffect(() => {
    console.log("[SellOn GSI] mounting, requesting script");
    return loadGISScript(() => {
      console.log("[SellOn GSI] script loaded, window.google =", !!window.google);
      setScriptReady(true);
    });
  }, []);

  useEffect(() => {
    console.log("[SellOn GSI] render effect", {
      scriptReady, hasClientId: !!clientId, hasRef: !!buttonRef.current,
      hasGoogle: !!window.google,
    });
    if (!scriptReady || !clientId || !buttonRef.current) return;
    if (!window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        setSubmitting(true);
        try {
          const res = await fetch(`${apiBase}/api/v1/auth/google`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          // If there's a reseller invite code, auto-join before redirecting.
          if (inviteCode && data?.role !== "admin") {
            await fetch(`${apiBase}/api/v1/reseller/join`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invite_code: inviteCode }),
            }).catch(() => {}); // fail-silent — join can be retried manually
          }

          const dest = data?.role === "admin"
            ? "/platform"
            : inviteCode
            ? "/reseller/catalog"
            : "/dashboard";
          push(dest);
          refresh();
        } catch (err) {
          showError(err);
          setSubmitting(false);
        }
      },
      ux_mode: "popup",
    });

    try {
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 320,
        locale: "id",
      });
      console.log("[SellOn GSI] renderButton called OK");
    } catch (e) {
      console.error("[SellOn GSI] renderButton threw", e);
    }
  }, [scriptReady, clientId, apiBase, push, refresh]);

  if (!clientId) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
        <p className="font-medium">Google Sign-In belum dikonfigurasi.</p>
        <p className="mt-1 text-neutral-700">
          Set <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> di <code>.env</code> lalu restart container web. Lihat README untuk panduan setup di Google Cloud.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={buttonRef}
        aria-label="Masuk dengan Google"
        className={submitting ? "pointer-events-none opacity-60" : ""}
      />
      {!scriptReady && (
        <p className="text-xs text-neutral-500">Memuat tombol Google…</p>
      )}
      {submitting && (
        <p className="text-sm text-neutral-500">Memverifikasi…</p>
      )}
    </div>
  );
}
