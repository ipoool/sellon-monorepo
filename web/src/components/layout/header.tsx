import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { Avatar } from "@/components/ui/avatar";
import { LogoutButton } from "@/components/auth/logout-button";
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
              <div className="flex items-center gap-3">
                <UserChip me={me} />
                <LogoutButton />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/masuk">
                  <Button size="sm" variant="ghost">
                    Masuk
                  </Button>
                </Link>
                <Link href="/masuk">
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

function UserChip({ me }: { me: Me }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar src={me.picture_url} name={me.name || me.email} />
      <span className="hidden text-sm font-medium text-neutral-700 sm:inline">
        {me.name?.split(" ")[0] || me.email}
      </span>
    </div>
  );
}
