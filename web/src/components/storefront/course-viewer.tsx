"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Info, CalendarX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BuyerOtpGate } from "@/components/storefront/buyer-otp-gate";
import { CoursePlayer } from "@/components/storefront/course-player";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Video = { title: string; youtube_id: string; description_md: string };
type Phase = "loading" | "gate" | "ready";
// Terminal access problems the OTP form can never fix — showing the email
// gate for these made the buyer submit a code just to learn the link is dead.
type Blocked = "not_found" | "expired" | "revoked";

const BLOCKED_COPY: Record<Blocked, { title: string; body: string }> = {
  not_found: {
    title: "Link tidak valid",
    body: "Link kelas ini tidak ditemukan atau sudah dinonaktifkan. Pakai link terbaru dari email pesananmu, atau hubungi penjual.",
  },
  expired: {
    title: "Masa aktif akses sudah berakhir",
    body: "Periode akses kelas ini sudah lewat, jadi materinya tidak bisa dibuka lagi. Hubungi penjual kalau kamu perlu perpanjangan.",
  },
  revoked: {
    title: "Akses dinonaktifkan oleh penjual",
    body: "Penjual menonaktifkan akses untuk link kelas ini. Hubungi penjual lewat kontak di halaman toko untuk info lebih lanjut.",
  },
};

export function CourseViewer({ slug, token }: { slug: string; token: string }) {
  const base = `${apiBase}/api/v1/storefront/${encodeURIComponent(slug)}/course/${encodeURIComponent(token)}`;

  const [phase, setPhase] = useState<Phase>("loading");
  const [productName, setProductName] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);

  // Try the gated content; returns true if the buyer is already authed.
  const loadContent = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${base}/content`, { credentials: "include", cache: "no-store" });
      if (res.status === 404) {
        setBlocked("not_found");
        return false;
      }
      if (res.status === 410) {
        setBlocked("expired");
        return false;
      }
      if (res.status === 403) {
        // 403 covers two very different cases: the seller revoked the token,
        // OR the buyer holds a buyer_session minted for a DIFFERENT token
        // (tokens are session-scoped). Only the first is terminal — the second
        // just needs a fresh OTP for this link.
        const body = await res.json().catch(() => ({}));
        if (typeof body?.error === "string" && body.error.includes("dinonaktifkan")) {
          setBlocked("revoked");
        }
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

  if (blocked) {
    const copy = BLOCKED_COPY[blocked];
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
              {blocked === "expired" ? (
                <CalendarX className="size-6" aria-hidden />
              ) : (
                <Info className="size-6" aria-hidden />
              )}
            </div>
            <h1 className="font-display text-xl font-semibold text-neutral-900">{copy.title}</h1>
            <p className="max-w-sm text-sm text-neutral-600">{copy.body}</p>
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
