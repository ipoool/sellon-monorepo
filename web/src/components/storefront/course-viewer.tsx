"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Lock, Loader2, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CoursePlayer } from "@/components/storefront/course-player";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Video = { title: string; youtube_id: string; description_md: string };
type Phase = "loading" | "email" | "code" | "ready";

export function CourseViewer({ slug, token }: { slug: string; token: string }) {
  const base = `${apiBase}/api/v1/storefront/${encodeURIComponent(slug)}/course/${encodeURIComponent(token)}`;

  const [phase, setPhase] = useState<Phase>("loading");
  const [productName, setProductName] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
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
      return true;
    } catch {
      return false;
    }
  }, [base]);

  useEffect(() => {
    void (async () => {
      const ok = await loadContent();
      setPhase(ok ? "ready" : "email");
    })();
  }, [loadContent]);

  async function requestOtp(e?: FormEvent) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${base}/request-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Gagal mengirim kode");
        return;
      }
      setMaskedEmail(data.email_masked || email.trim());
      setCode("");
      setPhase("code");
    } catch {
      setErr("Gagal mengirim kode. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e?: FormEvent) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${base}/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Kode salah");
        return;
      }
      const ok = await loadContent();
      setPhase(ok ? "ready" : "email");
    } catch {
      setErr("Gagal verifikasi. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

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

  if (phase === "email" || phase === "code") {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <Lock className="size-6" aria-hidden />
            </div>
            <h1 className="font-display text-xl font-semibold text-neutral-900">Akses Kelas</h1>
            <p className="max-w-sm text-sm text-neutral-600">
              {phase === "email"
                ? "Masukkan email yang kamu pakai saat pesan. Kami kirim kode verifikasi ke email itu."
                : `Kami kirim kode 6 digit ke ${maskedEmail}. Masukkan di bawah.`}
            </p>
          </div>

          {phase === "email" ? (
            <form onSubmit={requestOtp} className="mt-5 flex flex-col gap-3">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@kamu.com"
                autoFocus
              />
              {err && <p className="text-sm text-danger">{err}</p>}
              <Button type="submit" disabled={busy || !email.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Kirim kode
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="mt-5 flex flex-col gap-3">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="text-center text-lg tracking-[0.4em]"
                autoFocus
              />
              {err && <p className="text-sm text-danger">{err}</p>}
              <Button type="submit" disabled={busy || code.length < 6}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Verifikasi & buka kelas
              </Button>
              <button
                type="button"
                onClick={() => {
                  setErr("");
                  setPhase("email");
                }}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
              >
                ← Ganti email / kirim ulang
              </button>
            </form>
          )}
        </Card>
      </Shell>
    );
  }

  // phase === "ready" — render the shared course layout.
  return <CoursePlayer productName={productName} videos={videos} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-md px-4 py-10">{children}</div>;
}
