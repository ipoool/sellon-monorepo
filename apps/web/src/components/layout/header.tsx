import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/60 bg-white/80 backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight text-neutral-900">
            TokoFlow
          </Link>
          <nav className="flex items-center gap-6">
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
            <Link href="/masuk">
              <Button size="sm">Masuk</Button>
            </Link>
          </nav>
        </div>
      </Container>
    </header>
  );
}
