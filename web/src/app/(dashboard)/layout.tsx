import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { BannersWrapper } from "@/components/dashboard/banners-wrapper";
import { OrderNotifier } from "@/components/dashboard/order-notifier";
import { OfflineSyncWatcher } from "@/components/dashboard/offline-sync-watcher";
import { KdsProvider } from "@/components/dashboard/kds-context";
import { MenuCapabilitiesProvider } from "@/components/dashboard/menu-capabilities-context";
import { ProfilingGate } from "@/components/dashboard/profiling-gate";
import { PlanProvider } from "@/components/dashboard/plan-context";
import { BisnisGateProvider } from "@/components/dashboard/bisnis-gate";
import { SubscriptionExpiryBanner } from "@/components/dashboard/subscription-expiry-banner";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { DineInSettings, Store, Subscription } from "@/lib/types";

// Seller dashboard is private — never index any /(dashboard) route (in
// addition to the robots.txt disallow).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Guards all routes under (dashboard): must be authed AND have a store.
// First-time sellers (authed but no store yet) get sent to /setup.
//
// Platform admins are exempt: an admin without a store gets bounced to
// /admin instead, since the seller dasbor isn't useful to them. (When
// they impersonate, the impersonated user's store is read instead.)
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const isAdminMode = me.role === "admin" && !me.is_impersonated;

  const [data, subData, dinein] = await Promise.all([
    serverApi<{ store: Store | null }>("/api/v1/store"),
    // Subscription is nullable — admins without a store get null and we
    // skip the expiry banner entirely. Errors fall through to undefined,
    // also handled by the banner's null guard.
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
    // Dine-in/KDS settings — surfaced to the sidebar so the "Kitchen
    // Display" link is hidden when the seller doesn't run a KDS.
    serverApi<DineInSettings>("/api/v1/store/dinein"),
  ]);
  if (!data?.store) {
    // Admin without a store: let them through. The /dashboard seller page
    // itself bounces admins to /platform; admin sub-pages (under
    // /platform/*) don't need a store at all.
    if (!isAdminMode) {
      redirect("/setup");
    }
  }

  // The persistent banners are sticky at top — sidebar + sticky topbar
  // read CSS vars to offset themselves. Two stacked banners: impersonation
  // (--imp-h) sits on top, expiry warning (--exp-h) sits below it. Both
  // default to 0px when the corresponding banner isn't shown.
  const impClass = me.is_impersonated
    ? "[--imp-h:3.5rem]"
    : "[--imp-h:0px]";
  const sub = subData?.subscription;
  const showExpiry =
    !!sub &&
    sub.plan !== "free" &&
    !!sub.current_period_end &&
    sub.days_remaining > 0 &&
    sub.days_remaining <= 5;
  const expClass = showExpiry
    ? "[--exp-h:5rem] sm:[--exp-h:3rem]"
    : "[--exp-h:0px]";
  // --sbx-h kept at 0px (sandbox banner removed) so sidebar/topbar offset calcs
  // that reference it still resolve.
  const sbxClass = "[--sbx-h:0px]";

  return (
    <div className={`${impClass} ${expClass} ${sbxClass}`}>
      {/* BannersWrapper: single sticky block + measures real height → --banners-h */}
      <BannersWrapper>
        <ImpersonationBanner me={me} />
        <SubscriptionExpiryBanner subscription={sub ?? null} />
      </BannersWrapper>
      {/* OrderNotifier subscribes to a per-store SSE stream — no point
          mounting it for an admin who has no store of their own. */}
      {data?.store && <OrderNotifier />}
      {/* Global offline-order sync: flushes the IndexedDB queue in the
          background on every page (not just /pos), so queued POS sales sync
          even after the cashier navigates away or refreshes. */}
      {data?.store && <OfflineSyncWatcher />}
      {/* Force the one-time profiling step for an existing store owner who
          predates this feature (profiling_completed_at IS NULL). Staff have a
          separate sidebar and store-admins shouldn't be blocked on the owner's
          menu decision; platform admins without a store are already excluded by
          the data?.store guard. */}
      {data?.store &&
        !data.store.profiling_completed_at &&
        me.store_role !== "staff" &&
        me.store_role !== "admin" && <ProfilingGate />}
      {/* Surface the active tier to the dashboard sidebar (and any
          other client components that want to gate by plan) without
          prop-drilling through every page. */}
      <PlanProvider value={sub?.plan ?? "free"}>
        <BisnisGateProvider>
          {/* Which optional menu groups the seller enabled during profiling —
              consumed by the sidebar to show/hide groups. Defaults all-true so
              an admin without a store (no data.store) still sees everything. */}
          <MenuCapabilitiesProvider
            value={{
              pos: data?.store?.cap_pos ?? true,
              reseller: data?.store?.cap_reseller ?? true,
              digital: data?.store?.cap_digital ?? true,
              materials: data?.store?.cap_materials ?? true,
            }}
          >
            <KdsProvider value={dinein?.kds_enabled ?? false}>{children}</KdsProvider>
          </MenuCapabilitiesProvider>
        </BisnisGateProvider>
      </PlanProvider>
    </div>
  );
}
