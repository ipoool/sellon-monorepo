/**
 * Whether a subscription is live right now.
 *
 * A paid tier alone is not enough: the period may have run out while the
 * expiry worker has yet to flip the status, and a lapsed row is a lapsed
 * customer either way. Mirrors `paidSubPredicate` in the API, which is
 * what the "Berlangganan" filter counts — every surface that shows a plan
 * reads from this one rule so they cannot disagree about the same store.
 */
export function isSubscribed(s: {
  plan: string;
  sub_status: string;
  period_end?: string | null;
}): boolean {
  if (s.plan !== "pro" && s.plan !== "bisnis") return false;
  if (s.sub_status !== "active") return false;
  if (!s.period_end) return true;
  return new Date(s.period_end).getTime() > Date.now();
}

/** Seller-facing tier name for a live subscription. */
export function planLabel(plan: string): string {
  return plan === "bisnis" ? "Bisnis" : "Pro";
}
