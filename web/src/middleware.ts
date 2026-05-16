import { NextResponse, type NextRequest } from "next/server";

// The root host for this platform (e.g. "sellon.id" or "localhost:3100").
// Derived from NEXT_PUBLIC_SITE_URL so it stays in sync with the env.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const ROOT_HOST = new URL(siteUrl).host; // "sellon.id" or "localhost:3100"

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// Paths that must never be rewritten, even when the request arrives on a
// custom domain.  Protects the dashboard from sellers who accidentally point
// their apex domain at the platform.
const PASSTHROUGH_PREFIXES = [
  "/api/",
  "/_next/",
  "/favicon",
  "/robots.txt",
  "/sitemap",
  "/.well-known/",
  "/login",
  "/setup",
  "/settings",
  "/dashboard",
  "/orders",
  "/customers",
  "/products",
  "/promos",
  "/reports",
  "/platform",
];

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

  // Pass-through: dashboard/app paths that must never be rewritten.
  if (PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Custom domain: look up the corresponding store slug.
  const slug = await resolveDomainToSlug(hostNormalized);
  if (!slug) {
    // Unknown domain — let Next.js 404 naturally.
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
