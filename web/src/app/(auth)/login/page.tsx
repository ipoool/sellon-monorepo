import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Zap, Wallet, Sparkles, Handshake } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { MasukTestimonial } from "@/components/auth/login-testimonial";
import { getMe } from "@/lib/server-auth";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Masuk ke SellOn",
  description: "Login ke dasbor SellOn untuk kelola toko online & offline kamu.",
  path: "/login",
  noindex: true,
});

function benefitsFor(emailPassword: boolean) {
  return [
  {
    icon: Zap,
    title: "Setup 5 menit",
    description: emailPassword
      ? "Daftar dengan email & password, verifikasi lewat kode di email. Tidak perlu isi formulir panjang."
      : "Masuk sekali klik pakai akun Google. Tidak perlu isi formulir panjang.",
  },
  {
    icon: Wallet,
    title: "Dana langsung ke rekeningmu",
    description: "Pakai akun Midtrans kamu sendiri atau transfer bank manual - kami tidak pernah pegang uang pembeli.",
  },
  {
    icon: ShieldCheck,
    title: "Aman & private",
    description: emailPassword
      ? "Password kamu disimpan terenkripsi. Kami hanya menyimpan email, nama, dan data yang kamu isi sendiri."
      : "Kami hanya menyimpan email, nama, dan data yang kamu isi sendiri. Password Google-mu tidak pernah sampai ke kami.",
  },
  ];
}

/**
 * Which sign-in options to offer. Read at request time from the API rather
 * than baked into the bundle, so closing email signup (when outbound mail is
 * down) or rotating the Google client id is a server env change, not a web
 * rebuild + redeploy. Falls back to email-only if the API can't be reached,
 * which is the pre-existing behaviour.
 */
async function signInOptions(): Promise<{
  google: boolean;
  emailPassword: boolean;
  googleClientId?: string;
}> {
  try {
    const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${base}/api/v1/info`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return {
      google: !!data?.features?.google_signin,
      emailPassword: data?.features?.email_password !== false,
      googleClientId: data?.google_client_id,
    };
  } catch {
    // API unreachable: fall back to the email form rather than rendering a
    // page with no way in at all.
    return { google: false, emailPassword: true };
  }
}

export default async function MasukPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const me = await getMe();
  if (me) {
    if (me.role === "admin" && !me.is_impersonated) {
      redirect("/platform");
    }
    redirect("/dashboard");
  }

  const { invite } = await searchParams;
  const inviteCode = invite?.trim().toUpperCase() || undefined;
  const options = await signInOptions();

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link href="/" aria-label="SellOn — Beranda">
              <img
                src="/sellon-logo.svg"
                alt="SellOn"
                className="h-8 w-auto"
              />
            </Link>

            {inviteCode ? (
              <>
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                  <Handshake className="size-5 shrink-0 text-brand-700" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-brand-900">Kamu diundang jadi reseller!</p>
                    <p className="text-xs text-brand-700">Login atau daftar untuk otomatis bergabung ke program.</p>
                  </div>
                </div>
                <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  Daftar & langsung mulai resell
                </h1>
                <p className="mt-2 text-sm text-neutral-600">
                  {options.emailPassword
                    ? "Belum punya akun? Daftar pakai email — setelah verifikasi kamu langsung aktif sebagai reseller."
                    : "Belum punya akun? Lanjutkan dengan Google — kamu langsung aktif sebagai reseller."}
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  Masuk untuk mulai jualan
                </h1>
                <p className="mt-2 text-sm text-neutral-600">
                  {options.emailPassword
                    ? "Belum punya akun? Daftar pakai email dan password — tinggal verifikasi kode di email."
                    : "Belum punya akun? Lanjutkan dengan Google, akunmu langsung dibuat."}
                </p>
              </>
            )}
          </div>

          <Card variant="default">
            <CardContent className="gap-6">
              {!inviteCode && (
                <ul className="flex flex-col gap-4">
                  {benefitsFor(options.emailPassword).map(({ icon: Icon, title, description }) => (
                    <li key={title} className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Icon className="size-5" strokeWidth={2} aria-hidden />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">{description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {options.google && (
                <div className="flex flex-col gap-4">
                  <GoogleSignInButton
                    inviteCode={inviteCode}
                    clientId={options.googleClientId}
                  />
                  {!options.emailPassword && (
                    <p className="text-center text-xs leading-relaxed text-neutral-500">
                      Kalau kamu pernah pakai email yang sama, akunmu tetap yang
                      itu juga — tinggal lanjutkan dengan Google.
                    </p>
                  )}
                  {/* Divider only earns its place when something follows it. */}
                  {options.emailPassword && (
                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-neutral-200" />
                      <span className="text-xs text-neutral-400">atau</span>
                      <span className="h-px flex-1 bg-neutral-200" />
                    </div>
                  )}
                </div>
              )}

              {options.emailPassword && <EmailAuthForm inviteCode={inviteCode} />}
              <p className="text-center text-xs leading-relaxed text-neutral-500">
                Dengan masuk, kamu menyetujui{" "}
                <Link href="/terms" className="font-medium text-brand-600 hover:text-brand-700">
                  Syarat &amp; Ketentuan
                </Link>{" "}
                SellOn.
              </p>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-sm text-neutral-500">
            Butuh bantuan?{" "}
            <a
              href="mailto:halo@sellon.id"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              halo@sellon.id
            </a>
          </p>
        </div>
      </div>

      {/* Right: brand panel (desktop only) */}
      <div className="relative hidden overflow-hidden bg-gradient-brand-soft lg:flex lg:items-center lg:justify-center">
        <div
          className="bg-dot-grid absolute inset-0 opacity-60"
          aria-hidden
        />
        <div
          aria-hidden
          className="absolute -right-40 -top-40 size-96 rounded-full bg-brand-200/40 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-40 size-96 rounded-full bg-brand-300/30 blur-3xl"
        />

        <div className="relative mx-auto flex max-w-md flex-col gap-10 px-12">
          <Badge variant="brand" className="self-start">
            <Sparkles className="size-3" aria-hidden />
            Made for UMKM Indonesia
          </Badge>

          <MasukTestimonial />

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { value: "1.000+", label: "UMKM aktif" },
              { value: "Rp 0", label: "Take-rate" },
              { value: "4.9/5", label: "Rating" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/60 bg-white/60 px-3 py-4 backdrop-blur"
              >
                <p className="font-display text-lg font-semibold text-neutral-900">
                  {s.value}
                </p>
                <p className="mt-1 text-xs text-neutral-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
