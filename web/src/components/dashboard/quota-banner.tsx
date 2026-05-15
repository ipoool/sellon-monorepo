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

// QuotaBanner — varian minimalis: 1 baris label + count + progress bar
// tipis + tombol upgrade. State warna hanya berubah saat full (danger);
// warning state dihilangkan untuk menjaga UI tetap kalem.
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
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm text-neutral-700">
              {label}{" "}
              <span className="text-neutral-500">(tier {tierName})</span>
            </p>
            <p
              className={cn(
                "shrink-0 text-xs font-medium tabular-nums",
                full ? "text-danger" : "text-neutral-500",
              )}
            >
              {used.toLocaleString("id-ID")} / {limit.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
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
            Upgrade
          </Button>
        </Link>
      </div>

      {full && fullMessage && (
        <p className="mt-2 text-xs text-danger">{fullMessage}</p>
      )}
    </div>
  );
}
