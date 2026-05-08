"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import "@/lib/auth-types";

const GIS_SRC = "https://accounts.google.com/gsi/client";

export function GoogleSignInButton() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  useEffect(() => {
    if (!scriptReady || !clientId || !buttonRef.current) return;
    if (!window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        setSubmitting(true);
        setError(null);
        try {
          const res = await fetch(`${apiBase}/api/v1/auth/google`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          router.push("/dasbor");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Login gagal");
          setSubmitting(false);
        }
      },
      ux_mode: "popup",
    });

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
  }, [scriptReady, clientId, apiBase, router]);

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
      <Script src={GIS_SRC} strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
      <div
        ref={buttonRef}
        aria-label="Masuk dengan Google"
        className={submitting ? "pointer-events-none opacity-60" : ""}
      />
      {submitting && (
        <p className="text-sm text-neutral-500">Memverifikasi…</p>
      )}
      {error && (
        <p className="text-sm text-danger">{error}</p>
      )}
    </div>
  );
}
