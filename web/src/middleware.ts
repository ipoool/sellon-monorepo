import { NextResponse, type NextRequest } from "next/server";

// The root host for this platform (e.g. "sellon.id" or "localhost:3100").
// Derived from NEXT_PUBLIC_SITE_URL so it stays in sync with the env.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const ROOT_HOST = new URL(siteUrl).host; // "sellon.id" or "localhost:3100"

// Middleware runs on the SERVER, so it must reach the API the way every other
// server component does — over the internal Docker network. It was using
// NEXT_PUBLIC_API_URL, the BROWSER-facing URL: inside the container that
// resolves to the container itself, so the lookup below failed on every
// request and custom domains silently fell through to the platform's own
// routes. Where the public URL happens to be reachable it still sent an
// internal request out through the edge and back on every custom-domain hit.
const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

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

function isOwnStorePath(pathname: string, slug: string): boolean {
  return pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);
}

// A blank 404 body is what a seller's buyer would otherwise get from the guard
// below — a white page with no way back to the shop they were trying to reach.
// Middleware cannot render a React route without rewriting into SellOn's own
// not-found (which would put platform branding on the seller's domain), so
// this is a small self-contained page instead: the seller's own host, a link
// to their catalog, no SellOn branding.
function notFoundOnSellerDomain(): NextResponse {
  const body = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Halaman tidak ditemukan</title>
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#fafafa; color:#171717;
         font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif }
  main { max-width:28rem; padding:2rem; text-align:center }
  h1 { margin:0 0 .5rem; font-size:1.25rem }
  p { margin:0 0 1.5rem; color:#525252; font-size:.9375rem }
  a { display:inline-block; padding:.625rem 1.25rem; border-radius:.5rem;
      background:#171717; color:#fff; text-decoration:none; font-weight:600;
      font-size:.875rem }
</style>
</head>
<body>
<main>
  <h1>Halaman tidak ditemukan</h1>
  <p>Alamat yang kamu buka tidak ada di toko ini. Mungkin linknya sudah berubah.</p>
  <a href="/">Kembali ke toko</a>
</main>
</body>
</html>`;
  return new NextResponse(body, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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

  // We are on a seller's custom domain. Resolve which store owns it before
  // deciding anything: the answer determines not just where a storefront
  // path rewrites to, but what this host is allowed to serve at all.
  const slug = await resolveDomainToSlug(hostNormalized);
  if (!slug) {
    // Unknown domain — let Next.js 404 naturally.
    return NextResponse.next();
  }

  // A seller's domain serves that seller's shop and nothing else.
  //
  // Passing everything non-storefront through meant `toko-a.com/toko-b`
  // rendered a COMPETITOR's storefront, and /about, /blog/*, /help/* served
  // SellOn's marketing site under the seller's brand — all crawlable, so
  // the platform's content was duplicated across every custom domain.
  if (!isStorefrontPath(pathname) && !isOwnStorePath(pathname, slug)) {
    return notFoundOnSellerDomain();
  }

  // Defensive: never double-prefix (e.g. a store whose slug is "cart"), and
  // the store's own /{slug}/… links already resolve without a rewrite.
  if (isOwnStorePath(pathname, slug)) {
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
