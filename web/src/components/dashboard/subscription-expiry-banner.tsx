import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";

import type { Subscription } from "@/lib/types";

type Props = {
  subscription: Subscription | null | undefined;
};

// Number of days before period_end at which the warning starts showing.
// Tuned to give the seller a comfortable runway to renew without
// pestering them every day (no banner above this threshold).
const WARNING_THRESHOLD_DAYS = 5;

// Sticky warning banner shown on every authenticated dashboard page when
// a paid subscription (Pro / Bisnis) is within WARNING_THRESHOLD_DAYS of
// its period_end. Style mirrors <ImpersonationBanner /> but uses warning
// orange rather than danger red — this isn't a security concern, it's a
// renew nudge.
//
// Hidden when:
//   - no subscription / free plan (nothing to renew)
//   - period_end is missing (free tier or invariant violation)
//   - days_remaining > WARNING_THRESHOLD_DAYS (still plenty of time)
//   - days_remaining <= 0 (already expired — server-side downgrade
//     should kick in on the next request; we don't need to nag here)
export function SubscriptionExpiryBanner({ subscription }: Props) {
  if (!subscription) return null;
  if (subscription.plan === "free") return null;
  if (!subscription.current_period_end) return null;

  const days = subscription.days_remaining;
  if (days <= 0 || days > WARNING_THRESHOLD_DAYS) return null;

  const planLabel = subscription.plan === "pro" ? "Pro" : "Bisnis";
  const endDate = new Date(subscription.current_period_end);
  const endLabel = endDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const cancelled = subscription.status === "cancelled";

  return (
    <div
      role="alert"
      // z-[55] so this stacks UNDER the impersonation banner (z-[60])
      // when both happen to be visible at the same time.
      className="sticky top-[var(--imp-h,0px)] z-[55] flex flex-col gap-1 border-b border-warning/40 bg-warning/95 px-4 py-2 text-neutral-900 shadow-card sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 shrink-0" aria-hidden />
        <p className="text-sm font-semibold">
          {cancelled
            ? `Langganan ${planLabel} sudah dibatalkan`
            : `Langganan ${planLabel} hampir habis`}
        </p>
      </div>
      <p className="flex-1 text-sm">
        {days === 1 ? (
          <>
            Berakhir <span className="font-semibold">besok</span>
            {" "}({endLabel}).
          </>
        ) : (
          <>
            Berakhir dalam{" "}
            <span className="font-semibold">{days} hari</span> ({endLabel}).
          </>
        )}{" "}
        {cancelled
          ? "Aktifkan kembali sebelum tanggal itu agar tidak turun ke tier Gratis."
          : "Perpanjang sekarang biar toko-mu tidak turun ke tier Gratis."}
      </p>
      <Link
        href="/dashboard/settings/subscription"
        className="inline-flex h-8 items-center gap-1.5 self-start rounded-md bg-neutral-900 px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:self-auto"
      >
        {cancelled ? "Aktifkan kembali" : "Perpanjang sekarang"}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
