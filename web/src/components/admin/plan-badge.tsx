import { AlertTriangle, Crown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateID } from "@/lib/format";
import { isSubscribed, planLabel } from "@/lib/subscription";

type Props = {
  plan: string;
  subStatus: string;
  periodEnd?: string | null;
  /** Hide the renewal date — for tables too narrow to carry a second line. */
  compact?: boolean;
};

/**
 * The subscription state of one store, as the admin sees it.
 *
 * A lapsed subscriber reads "Gratis", not "Pro · Expired": that IS what
 * the store can use today. Shared by the user and store tables so the two
 * can never describe the same store differently.
 */
export function PlanBadge({ plan, subStatus, periodEnd, compact }: Props) {
  const live = isSubscribed({ plan, sub_status: subStatus, period_end: periodEnd });

  if (!live) return <Badge variant="outline">Gratis</Badge>;

  const badge = (
    <Badge variant="warning" className="gap-1">
      <Crown className="size-3" aria-hidden />
      {planLabel(plan)}
    </Badge>
  );
  if (compact || !periodEnd) return badge;

  // `new Date()` rather than `Date.now()`: same value, and it matches
  // what the rest of the dashboard does for render-time clock reads.
  const daysLeft = Math.ceil(
    (new Date(periodEnd).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return (
    <div className="flex flex-col items-start gap-1">
      {badge}
      {daysLeft <= 3 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="size-3" aria-hidden />
          {formatDateID(periodEnd)}
        </span>
      ) : (
        <span className="text-xs text-neutral-500">
          {formatDateID(periodEnd)}
        </span>
      )}
    </div>
  );
}
