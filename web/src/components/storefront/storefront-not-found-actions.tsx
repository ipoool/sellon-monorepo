"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Store } from "lucide-react";

import { Button } from "@/components/ui/button";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Routes the storefront serves from a CUSTOM DOMAIN's own root (see
// middleware.ts). Seeing one of these as the first path segment means we are on
// a seller's domain, where the catalog is simply "/" — on sellon.id the first
// segment is the store slug instead.
const CUSTOM_DOMAIN_ROOT_SEGMENTS = new Set([
  "product",
  "order",
  "course",
  "cart",
  "checkout",
]);

/**
 * The way out of the storefront 404.
 *
 * `not-found.tsx` takes no props and cannot read route params, and Next's own
 * guidance for path-dependent 404 content is to resolve it on the client — so
 * this reads the slug off the pathname and asks the public storefront endpoint
 * whether that store actually exists. It matters which: a dead PRODUCT link
 * should offer the seller's catalog, while a dead STORE link has no catalog to
 * offer and should send the visitor to sellon.id.
 */
export function StorefrontNotFoundActions() {
  const pathname = usePathname();
  const slug = pathname.split("/").filter(Boolean)[0];
  // Custom domain: the store is whatever the domain resolves to, already proven
  // to exist by the middleware that rewrote us here. No lookup needed — and
  // deliberately no SellOn link, which would be our marketing on their domain.
  const onCustomDomain = !slug || CUSTOM_DOMAIN_ROOT_SEGMENTS.has(slug);

  const [store, setStore] = useState<
    { found: false } | { found: true; name?: string } | null
  >(null);

  useEffect(() => {
    if (onCustomDomain) return;
    let alive = true;
    fetch(`${apiBase}/api/v1/storefront/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive) return;
        setStore(data ? { found: true, name: data?.store?.name } : { found: false });
      })
      .catch(() => {
        // Can't tell whether the store exists — send them somewhere that is
        // certainly alive rather than to a link that may 404 again.
        if (alive) setStore({ found: false });
      });
    return () => {
      alive = false;
    };
  }, [slug, onCustomDomain]);

  if (!onCustomDomain && store === null) {
    // Reserve the button's height so the copy above doesn't jump once the
    // lookup lands.
    return <div className="mt-6 h-10" aria-hidden />;
  }

  if (!onCustomDomain && store?.found === false) {
    return (
      <div className="mt-6 flex justify-center">
        <Button asChild size="md" variant="outline">
          <Link href="/">
            <Home className="size-4" aria-hidden />
            Buka halaman utama SellOn
          </Link>
        </Button>
      </div>
    );
  }

  const storeName = store?.found ? store.name : undefined;
  return (
    <div className="mt-6 flex justify-center">
      <Button asChild size="md">
        <Link href={onCustomDomain ? "/" : `/${slug}`}>
          <Store className="size-4" aria-hidden />
          {storeName ? `Lihat katalog ${storeName}` : "Lihat katalog toko"}
        </Link>
      </Button>
    </div>
  );
}
