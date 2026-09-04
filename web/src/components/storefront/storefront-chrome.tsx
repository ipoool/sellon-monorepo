"use client";

import { usePathname } from "next/navigation";

import { CartFab } from "./cart-fab";
import { CookieConsent, useConsent } from "./cookie-consent";
import { MetaPixel } from "./meta-pixel";

type Props = {
  storeSlug: string;
  pixelId: string;
};

// Client-side chrome for the storefront shell: the Meta Pixel, the cart FAB and
// the cookie banner. Kept in one client component so the pathname/consent rules
// live in a single place:
//
//  - the Pixel only mounts once the buyer has ACCEPTED cookies (the banner's
//    "Tolak" used to change nothing while the funnel still fired to Meta), and
//  - none of it mounts on /{slug}/course/{token}, the private OTP-gated course
//    viewer — no ad tracking, no cart, no banner on paid content.
export function StorefrontChrome({ storeSlug, pixelId }: Props) {
  const pathname = usePathname();
  const consent = useConsent();

  // The rewrite on a custom domain keeps `/{slug}` in the resolved path, but
  // the browser URL may be the bare `/course/{token}` — match both.
  const isCourse =
    pathname.startsWith(`/${storeSlug}/course/`) ||
    pathname.startsWith("/course/");
  if (isCourse) return null;

  return (
    <>
      {pixelId && consent === "accepted" && <MetaPixel pixelId={pixelId} />}
      <CartFab storeSlug={storeSlug} />
      <CookieConsent hasAnalytics={!!pixelId} />
    </>
  );
}
