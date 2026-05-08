import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Zap, Wallet, Quote, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getMe } from "@/lib/server-auth";

const benefits = [
  {
    icon: Zap,
    title: "Setup 5 menit",
    description: "Akun otomatis dibuat dari Google. Tidak perlu isi formulir panjang.",
  },
  {
    icon: Wallet,
    title: "Dana langsung ke rekeningmu",
    description: "Pakai akun Midtrans/Xendit kamu sendiri — kami tidak pernah pegang uang pembeli.",
  },
  {
    icon: ShieldCheck,
    title: "Aman & private",
    description: "Login pakai standar Google OAuth. Kami hanya menyimpan email, nama, dan foto profil.",
  },
];

export default async function MasukPage() {
  const me = await getMe();
  if (me) redirect("/dasbor");

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link
              href="/"
              className="font-display text-2xl font-semibold text-neutral-900"
            >
              SellOn
            </Link>
            <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Masuk untuk mulai jualan
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Belum punya akun? Tenang — login pertama kali otomatis bikin akun
              untukmu.
            </p>
          </div>

          <Card variant="default">
            <CardContent className="gap-6">
              <ul className="flex flex-col gap-4">
                {benefits.map(({ icon: Icon, title, description }) => (
                  <li key={title} className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="size-5" strokeWidth={2} aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {title}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="relative my-2">
                <div
                  aria-hidden
                  className="absolute inset-0 flex items-center"
                >
                  <span className="w-full border-t border-neutral-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-xs uppercase tracking-wider text-neutral-400">
                    Lanjutkan dengan
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4">
                <GoogleSignInButton />
                <p className="text-center text-xs leading-relaxed text-neutral-500">
                  Dengan masuk, kamu menyetujui{" "}
                  <Link
                    href="/syarat-ketentuan"
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Syarat &amp; Ketentuan
                  </Link>{" "}
                  SellOn.
                </p>
              </div>
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

          <div className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-popout backdrop-blur">
            <Quote className="size-8 text-brand-300" aria-hidden />
            <p className="mt-4 font-display text-xl font-medium leading-relaxed text-neutral-900">
              &ldquo;Jualan online sekarang sesimpel kirim chat. SellOn bikin saya
              fokus produksi, bukan bales pesan satu-satu.&rdquo;
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Avatar name="Sari Wulandari" size="md" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  Sari Wulandari
                </p>
                <p className="text-xs text-neutral-600">
                  Pemilik Warung Bu Sari · Yogyakarta
                </p>
              </div>
            </div>
          </div>

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
