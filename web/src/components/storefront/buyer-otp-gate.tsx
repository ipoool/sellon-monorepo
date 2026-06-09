"use client";

import { useState, type FormEvent } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Phase = "email" | "code";

type Props = {
  // Endpoint base — must expose POST {base}/request-otp + {base}/verify-otp.
  // Used for both course (/storefront/{slug}/course/{token}) and digital
  // (/download/{token}) buyer-OTP flows.
  base: string;
  title?: string;
  // Called after a successful verify (the buyer_session cookie is now set).
  onVerified: () => void | Promise<void>;
};

// BuyerOtpGate renders the email → code → verify flow shared by the course
// viewer and the digital-download page. Card-only: the parent provides the
// centered layout wrapper (so it works both full-screen and inside a page
// shell). The buyer must enter the email used at checkout; the backend matches
// it against the order before issuing a token-scoped session cookie.
export function BuyerOtpGate({ base, title = "Akses", onVerified }: Props) {
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

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
      await onVerified();
    } catch {
      setErr("Gagal verifikasi. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Lock className="size-6" aria-hidden />
        </div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">{title}</h1>
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
            Verifikasi & buka
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
  );
}
