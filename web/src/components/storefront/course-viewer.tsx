"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BuyerOtpGate } from "@/components/storefront/buyer-otp-gate";
import { CoursePlayer } from "@/components/storefront/course-player";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Video = { title: string; youtube_id: string; description_md: string };
type Phase = "loading" | "gate" | "ready";

export function CourseViewer({ slug, token }: { slug: string; token: string }) {
  const base = `${apiBase}/api/v1/storefront/${encodeURIComponent(slug)}/course/${encodeURIComponent(token)}`;

  const [phase, setPhase] = useState<Phase>("loading");
  const [productName, setProductName] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Try the gated content; returns true if the buyer is already authed.
  const loadContent = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${base}/content`, { credentials: "include", cache: "no-store" });
      if (res.status === 404 || res.status === 403) {
        if (res.status === 404) setNotFound(true);
        return false;
      }
      if (!res.ok) return false; // 401 → needs OTP
      const data = await res.json();
      setProductName(data.product_name ?? "");
      setVideos(Array.isArray(data.videos) ? data.videos : []);
      setExpiresAt(typeof data.expires_at === "string" ? data.expires_at : null);
      return true;
    } catch {
      return false;
    }
  }, [base]);

  useEffect(() => {
    void (async () => {
      const ok = await loadContent();
      setPhase(ok ? "ready" : "gate");
    })();
  }, [loadContent]);

  if (notFound) {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Info className="size-6" aria-hidden />
            </div>
            <h1 className="font-display text-xl font-semibold text-neutral-900">Link tidak valid</h1>
            <p className="max-w-sm text-sm text-neutral-600">
              Link kelas ini tidak ditemukan atau sudah dinonaktifkan. Pakai link
              terbaru dari email pesananmu, atau hubungi penjual.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      </Shell>
    );
  }

  if (phase === "gate") {
    return (
      <Shell>
        <BuyerOtpGate
          base={base}
          title="Akses Kelas"
          onVerified={async () => {
            const ok = await loadContent();
            setPhase(ok ? "ready" : "gate");
          }}
        />
      </Shell>
    );
  }

  // phase === "ready" — render the shared course layout.
  const accessNote = expiresAt
    ? `Akses berlaku sampai ${formatAccessDate(expiresAt)}`
    : "Akses seumur hidup";
  return <CoursePlayer productName={productName} videos={videos} accessNote={accessNote} />;
}

// formatAccessDate renders an ISO timestamp as a short Indonesian date.
function formatAccessDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
