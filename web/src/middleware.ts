import { NextResponse, type NextRequest } from "next/server";

// The root host for this platform (e.g. "sellon.id" or "localhost:3100").
// Derived from NEXT_PUBLIC_SITE_URL so it stays in sync with the env.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const ROOT_HOST = new URL(siteUrl).host; // "sellon.id" or "localhost:3100"

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// Allow-list of the storefront paths a custom domain serves from ITS OWN root
// — the exact set of routes under web/src/app/[slug]. Everything else (the
// dashboard, /platform, /pos, /kds, /download, /t, /q, /blog, /help, static
// assets, AND the `/{slug}/…` hrefs the storefront components themselves emit)
// passes through untouched.
//
// This is deliberately an allow-list rather than the old deny-list of
// dashboard prefixes: the deny-list had to enumerate every app route and went
// stale as routes were added, 404-ing them on seller domains. It also rewrote
// `/{slug}/cart` → `/{slug}/{slug}/cart`, so every internal storefront link
// 404'd on a custom domain.
const STOREFRONT_EXACT_PATHS = new Set(["/", "/cart", "/checkout"]);
const STOREFRONT_PREFIXES = ["/product/", "/order/", "/course/"];

function isStorefrontPath(pathname: string): boolean {
  if (STOREFRONT_EXACT_PATHS.has(pathname)) return true;
  return STOREFRONT_PREFIXES.some((p) => pathname.startsWith(p));
}

async function resolveDomainToSlug(host: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/v1/storefront/domain-lookup?host=${encodeURIComponent(host)}`,
      // ISR-style cache: re-validate at most once per minute.
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { slug?: string };
    return data.slug ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const rawHost = request.headers.get("host") ?? "";
  // Strip port for comparison, but keep it in the original for matching ROOT_HOST.
  const hostNormalized = rawHost.split(":")[0];
  const pathname = request.nextUrl.pathname;

  // Pass-through: root domain or localhost (the vast majority of requests).
  if (
    rawHost === ROOT_HOST ||
    hostNormalized === "localhost" ||
    hostNormalized === "127.0.0.1"
  ) {
    return NextResponse.next();
  }

  // Pass-through: anything that isn't a bare storefront path. Notably this
  // covers `/{slug}/…` links, which already resolve to the [slug] route on
  // any host and must NOT get a second slug prefix.
  if (!isStorefrontPath(pathname)) {
    return NextResponse.next();
  }

  // Custom domain: look up the corresponding store slug.
  const slug = await resolveDomainToSlug(hostNormalized);
  if (!slug) {
    // Unknown domain — let Next.js 404 naturally.
    return NextResponse.next();
  }

  // Defensive: never double-prefix (e.g. a store whose slug is "cart").
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    return NextResponse.next();
  }

  // Rewrite: /              → /{slug}
  //          /product/foo   → /{slug}/product/foo
  //          /cart          → /{slug}/cart
  //          /order/X       → /{slug}/order/X
  const url = request.nextUrl.clone();
  url.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
