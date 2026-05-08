import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getMe } from "@/lib/server-auth";

export default async function MasukPage() {
  const me = await getMe();
  if (me) redirect("/dasbor");

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="font-display text-2xl font-semibold text-neutral-900">
            TokoFlow
          </Link>
          <p className="mt-2 text-sm text-neutral-600">
            Masuk untuk kelola toko WhatsApp-mu
          </p>
        </div>

        <Card>
          <CardContent>
            <div className="flex flex-col items-center gap-5 py-2">
              <GoogleSignInButton />
              <p className="text-center text-xs text-neutral-500">
                Dengan masuk, kamu menyetujui{" "}
                <Link
                  href="/syarat-ketentuan"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Syarat &amp; Ketentuan
                </Link>{" "}
                TokoFlow.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
