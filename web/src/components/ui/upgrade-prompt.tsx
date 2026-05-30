import Link from "next/link";
import { Lock, Crown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// UpgradePrompt — the standard locked-feature panel for Bisnis-only features.
// Server-compatible (no hooks): renders inside server or client trees.
export function UpgradePrompt({
  feature,
  description,
  className,
}: {
  feature: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <Lock className="size-7" aria-hidden />
      </div>
      <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
        {feature} tersedia di paket Bisnis
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
        {description ??
          "Upgrade ke paket Bisnis (Rp299rb/bulan) untuk membuka fitur ini."}
      </p>
      <Link href="/settings/subscription" className="mt-5 inline-block">
        <Button size="sm">
          <Crown className="size-4" aria-hidden />
          Lihat Paket Bisnis
        </Button>
      </Link>
    </div>
  );
}
