import Link from "next/link";
import { Crown, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

// Wraps a chart / data card with a "blurred preview + upgrade CTA"
// overlay. Used as the Free-tier conversion lever — the seller can
// see the *shape* of the value they'd get, but the actual data is
// obscured.
//
// We keep the underlying chart in the DOM (just visually blurred +
// pointer-events disabled) so the empty/loaded states still look right
// and there's no layout shift on upgrade.
export function LockedChartOverlay({
  title,
  description,
  ctaHref = "/settings/subscription",
  children,
}: {
  title: string;
  description: string;
  ctaHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none select-none blur-[6px]"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/40 via-white/70 to-white/95">
        <div className="max-w-sm rounded-xl border border-warning/40 bg-white/95 p-5 text-center shadow-card backdrop-blur">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Lock className="size-5" aria-hidden />
          </div>
          <h3 className="mt-3 font-semibold text-neutral-900">{title}</h3>
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
          <Link href={ctaHref} className="mt-4 inline-block">
            <Button size="sm">
              <Crown className="size-3.5" aria-hidden />
              Upgrade ke Pro
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
