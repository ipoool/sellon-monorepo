import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { LogoutButton } from "@/components/auth/logout-button";
import type { Me } from "@/lib/auth-types";

type HeaderProps = {
  me?: Me | null;
};

export function Header({ me }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/60 bg-white/80 backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-neutral-900"
          >
            SellOn
          </Link>
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/#fitur"
              className="hidden text-sm text-neutral-600 transition-colors hover:text-neutral-900 sm:inline"
            >
              Fitur
            </Link>
            <Link
              href="/#harga"
              className="hidden text-sm text-neutral-600 transition-colors hover:text-neutral-900 sm:inline"
            >
              Harga
            </Link>

            {me ? (
              <div className="flex items-center gap-3">
                <UserChip me={me} />
                <LogoutButton />
              </div>
            ) : (
              <Link href="/masuk">
                <Button size="sm">Masuk</Button>
              </Link>
            )}
          </nav>
        </div>
      </Container>
    </header>
  );
}

function UserChip({ me }: { me: Me }) {
  const initial =
    (me.name || me.email).trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex items-center gap-2">
      {me.picture_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={me.picture_url}
          alt={me.name || me.email}
          width={32}
          height={32}
          className="size-8 rounded-full border border-neutral-200"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex size-8 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-700">
          {initial}
        </div>
      )}
      <span className="hidden text-sm font-medium text-neutral-700 sm:inline">
        {me.name?.split(" ")[0] || me.email}
      </span>
    </div>
  );
}
