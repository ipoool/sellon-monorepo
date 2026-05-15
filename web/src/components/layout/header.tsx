import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { Avatar } from "@/components/ui/avatar";
import type { Me } from "@/lib/auth-types";

type HeaderProps = {
  me?: Me | null;
  variant?: "marketing" | "app";
};

export function Header({ me, variant = "marketing" }: HeaderProps) {
  const showMarketingLinks = variant === "marketing";
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-neutral-900 transition-opacity hover:opacity-80"
          >
            SellOn
          </Link>

          <nav className="flex items-center gap-2 sm:gap-5">
            {showMarketingLinks && (
              <>
                <Link
                  href="/#fitur"
                  className="hidden rounded-md px-2 py-1 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 md:inline"
                >
                  Fitur
                </Link>
                <Link
                  href="/#cara-kerja"
                  className="hidden rounded-md px-2 py-1 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 md:inline"
                >
                  Cara Kerja
                </Link>
                <Link
                  href="/#harga"
                  className="hidden rounded-md px-2 py-1 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 md:inline"
                >
                  Harga
                </Link>
                <Link
                  href="/#faq"
                  className="hidden rounded-md px-2 py-1 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 lg:inline"
                >
                  FAQ
                </Link>

                <span className="hidden h-5 w-px bg-neutral-200 md:inline-block" />
              </>
            )}

            {me ? (
              <div className="flex items-center gap-2">
                <Link href="/dashboard">
                  <Button size="sm">
                    <LayoutDashboard className="size-4" aria-hidden />
                    Buka Dasbor
                  </Button>
                </Link>
                <Link
                  href="/dashboard"
                  className="hidden items-center sm:inline-flex"
                  aria-label={`Masuk ke dasbor sebagai ${me.name || me.email}`}
                >
                  <Avatar
                    src={me.picture_url}
                    name={me.name || me.email}
                    size="sm"
                  />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button size="sm" variant="ghost">
                    Masuk
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="sm">Mulai Gratis</Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      </Container>
    </header>
  );
}

