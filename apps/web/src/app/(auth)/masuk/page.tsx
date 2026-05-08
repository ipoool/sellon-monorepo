import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Zap, Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
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
    <div className="flex min-h-svh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-display text-2xl font-semibold text-neutral-900"
          >
            SellOn
          </Link>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Masuk untuk mulai jualan
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Belum punya akun? Tenang — login pertama kali otomatis bikin akun untukmu.
          </p>
        </div>

        <Card>
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
  );
}
