import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function MasukPage() {
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
            <form className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="kamu@toko.id" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Kata Sandi</Label>
                <Input id="password" type="password" placeholder="••••••••" />
              </div>
              <Button type="submit" size="lg" className="mt-2">
                Masuk
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Belum punya akun?{" "}
          <Link href="/" className="font-medium text-brand-600 hover:text-brand-700">
            Daftar gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
