"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, ShieldCheck, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Mode = "login" | "register";
/**
 * "verify" proves a new/claimed account owns the mailbox (code + the password
 * typed on the form — the backend refuses the code alone). "forgot"/"reset"
 * is the separate lupa-password path.
 */
type Step = "form" | "verify" | "forgot" | "reset";

async function postJSON(path: string, body: unknown) {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Only rendered when the email+password path is open (see the login page):
// when it is closed the whole form is omitted, not disabled in place.
export function EmailAuthForm({ inviteCode }: { inviteCode?: string }) {
  const { push, refresh } = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");

  async function finishLogin(data: { role?: string }) {
    if (inviteCode && data?.role !== "admin") {
      await fetch(`${apiBase}/api/v1/reseller/join`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode }),
      }).catch(() => {}); // fail-silent — join can be retried manually
    }
    const dest =
      data?.role === "admin" ? "/platform" : inviteCode ? "/reseller/catalog" : "/dashboard";
    push(dest);
    refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "register") {
        const { ok, data } = await postJSON("/api/v1/auth/register", {
          email,
          password,
          name,
        });
        if (!ok) throw new Error(data.error || "Gagal mendaftar");
        if (data.status === "verify_email") {
          setCode("");
          setStep("verify");
          showSuccess("Kode verifikasi dikirim ke email kamu");
        } else {
          await finishLogin(data);
        }
      } else {
        const { ok, status, data } = await postJSON("/api/v1/auth/login", {
          email,
          password,
        });
        if (status === 403 && data.status === "verify_email") {
          setCode("");
          setStep("verify");
          showSuccess(data.error || "Email belum diverifikasi — cek kode di email kamu");
          return;
        }
        if (!ok) throw new Error(data.error || "Gagal masuk");
        await finishLogin(data);
      }
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Password goes with the code: it is what the backend installs on the
      // account, so the code alone can never set someone else's password.
      const { ok, data } = await postJSON("/api/v1/auth/verify-email", {
        email,
        code,
        password,
      });
      if (!ok) throw new Error(data.error || "Kode salah");
      await finishLogin(data);
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const { ok, status, data } = await postJSON("/api/v1/auth/resend-verification", { email });
      if (status === 429) {
        showError(data.error || "Kode baru saja dikirim, tunggu sebentar");
        return;
      }
      if (!ok) throw new Error(data.error || "Gagal mengirim ulang kode");
      showSuccess("Kode baru sudah dikirim ke email kamu");
    } catch (err) {
      showError(err);
    } finally {
      setResending(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { ok, data } = await postJSON("/api/v1/auth/forgot-password", { email });
      if (!ok) throw new Error(data.error || "Gagal mengirim kode");
      setCode("");
      setNewPassword("");
      setStep("reset");
      showSuccess("Kalau email terdaftar, kode reset sudah kami kirim");
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { ok, data } = await postJSON("/api/v1/auth/reset-password", {
        email,
        code,
        password: newPassword,
      });
      if (!ok) throw new Error(data.error || "Gagal mengatur ulang password");
      showSuccess("Password berhasil diperbarui");
      await finishLogin(data);
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function backToForm() {
    setStep("form");
    setCode("");
    setNewPassword("");
  }

  if (step === "verify") {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <ShieldCheck className="size-5 shrink-0 text-brand-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-brand-900">Cek email kamu</p>
            <p className="text-xs text-brand-700">
              Kami kirim kode 6 digit ke <span className="font-medium">{email}</span>. Berlaku 15 menit.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Verifikasi</Label>
          <Input
            id="code"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="text-center text-lg font-semibold tracking-[0.4em]"
            required
          />
        </div>
        {!password && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-password">Password</Label>
            <Input
              id="verify-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password yang kamu pakai saat daftar"
              autoComplete="current-password"
              required
            />
          </div>
        )}
        <Button type="submit" disabled={submitting || code.length !== 6} className="w-full">
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Verifikasi &amp; Masuk
        </Button>
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-center text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {resending ? "Mengirim ulang…" : "Kirim ulang kode"}
        </button>
        <button
          type="button"
          onClick={backToForm}
          className="text-center text-xs text-neutral-500 hover:text-neutral-700"
        >
          &larr; Ganti email
        </button>
      </form>
    );
  }

  if (step === "forgot") {
    return (
      <form onSubmit={handleForgot} className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <KeyRound className="size-5 shrink-0 text-neutral-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-neutral-900">Lupa password</p>
            <p className="text-xs text-neutral-600">
              Masukkan email akunmu. Kami kirim kode untuk bikin password baru.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            autoComplete="email"
            required
          />
        </div>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Kirim Kode Reset
        </Button>
        <button
          type="button"
          onClick={backToForm}
          className="text-center text-xs text-neutral-500 hover:text-neutral-700"
        >
          &larr; Kembali ke halaman masuk
        </button>
      </form>
    );
  }

  if (step === "reset") {
    return (
      <form onSubmit={handleReset} className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <ShieldCheck className="size-5 shrink-0 text-brand-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-brand-900">Buat password baru</p>
            <p className="text-xs text-brand-700">
              Kode 6 digit kami kirim ke <span className="font-medium">{email}</span>. Berlaku 15 menit.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-code">Kode Reset</Label>
          <Input
            id="reset-code"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="text-center text-lg font-semibold tracking-[0.4em]"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-password">Password Baru</Label>
          <Input
            id="reset-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimal 8 karakter, huruf & angka"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        <Button
          type="submit"
          disabled={submitting || code.length !== 6 || newPassword.length < 8}
          className="w-full"
        >
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan &amp; Masuk
        </Button>
        <button
          type="button"
          onClick={() => setStep("forgot")}
          className="text-center text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Kirim ulang kode
        </button>
        <button
          type="button"
          onClick={backToForm}
          className="text-center text-xs text-neutral-500 hover:text-neutral-700"
        >
          &larr; Kembali ke halaman masuk
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 text-sm font-medium">
        {(["login", "register"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md py-2 transition-colors",
              mode === m
                ? "bg-white text-neutral-900 shadow-soft"
                : "text-neutral-500 hover:text-neutral-800",
            )}
          >
            {m === "login" ? "Masuk" : "Daftar"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "register" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama kamu"
              autoComplete="name"
              required
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => setStep("forgot")}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Lupa password?
              </button>
            )}
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Minimal 8 karakter, huruf & angka" : "Password kamu"}
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
          />
        </div>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          <Mail className="size-4" aria-hidden />
          {mode === "register" ? "Daftar dengan Email" : "Masuk"}
        </Button>
      </form>
    </div>
  );
}
