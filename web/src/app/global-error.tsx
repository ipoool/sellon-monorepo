"use client";

import { useEffect } from "react";

// Last-resort error boundary that wraps the root layout itself. Trips
// only when the root layout/template throws — for any nested segment
// error.tsx above takes the hit first.
//
// Must own its <html>/<body> because it replaces the root layout when
// active. Globals.css is imported via the root layout, which is gone
// here — so styling stays inline / minimal on purpose.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error.tsx]", error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#fafafa",
          color: "#171717",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <p
            style={{
              fontSize: 96,
              fontWeight: 700,
              margin: 0,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: "#0d9488",
            }}
          >
            500
          </p>
          <h1
            style={{
              marginTop: 8,
              marginBottom: 8,
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            Aplikasi gagal dimuat
          </h1>
          <p style={{ margin: 0, color: "#525252", fontSize: 16 }}>
            Terjadi error fatal saat memuat halaman. Coba muat ulang. Kalau
            masih bermasalah, hubungi support kami.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 16,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                fontSize: 12,
                color: "#737373",
              }}
            >
              Kode rujukan: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: 24,
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                background: "#0d9488",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Coba lagi
            </button>
            <a
              href="/"
              style={{
                background: "transparent",
                color: "#171717",
                border: "1px solid #d4d4d4",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Kembali ke beranda
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
