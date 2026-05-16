import Link from "next/link";
import { Crown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  tierName: string;
  used: number;
  limit: number;
  fullMessage?: string;
};

export function QuotaBanner({ label, tierName, used, limit, fullMessage }: Props) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const full = used >= limit;

  return (
    <div
      className={cn(
        "mb-5 rounded-lg border bg-white p-3 sm:p-4",
        full ? "border-danger/40" : "border-neutral-200",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {/* Label baris 1 */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-medium text-neutral-800">
              {label}
              <span className="ml-1 text-xs font-normal text-neutral-500">
                (tier {tierName})
              </span>
            </p>
            <p
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                full ? "text-danger" : "text-neutral-600",
              )}
            >
              {used.toLocaleString("id-ID")} / {limit.toLocaleString("id-ID")}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                full ? "bg-danger" : "bg-brand-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <Link href="/settings/subscription" className="shrink-0">
          <Button size="sm" variant={full ? "default" : "outline"}>
            <Crown className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Upgrade</span>
            <span className="sm:hidden">↑</span>
          </Button>
        </Link>
      </div>

      {full && fullMessage && (
        <p className="mt-2 text-xs text-danger">{fullMessage}</p>
      )}
    </div>
  );
}
