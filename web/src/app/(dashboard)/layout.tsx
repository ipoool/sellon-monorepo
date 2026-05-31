import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { BannersWrapper } from "@/components/dashboard/banners-wrapper";
import { OrderNotifier } from "@/components/dashboard/order-notifier";
import { KdsProvider } from "@/components/dashboard/kds-context";
import { PlanProvider } from "@/components/dashboard/plan-context";
import { BisnisGateProvider } from "@/components/dashboard/bisnis-gate";
import { SandboxBanner } from "@/components/dashboard/sandbox-banner";
import { SubscriptionExpiryBanner } from "@/components/dashboard/subscription-expiry-banner";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { DineInSettings, GatewayInfo, Store, Subscription } from "@/lib/types";

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

  const [data, subData, gateway, dinein] = await Promise.all([
    serverApi<{ store: Store | null }>("/api/v1/store"),
    // Subscription is nullable — admins without a store get null and we
    // skip the expiry banner entirely. Errors fall through to undefined,
    // also handled by the banner's null guard.
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
    // Midtrans gateway info — kalau seller pakai sandbox keys, banner
    // sandbox di-render di atas dasbor. serverApi balas null kalau
    // gateway endpoint error / belum configure.
    serverApi<GatewayInfo>("/api/v1/payments/midtrans"),
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
  const showSandbox = !!gateway && gateway.is_sandbox;
  const sbxClass = showSandbox
    ? "[--sbx-h:5rem] sm:[--sbx-h:3rem]"
    : "[--sbx-h:0px]";

  return (
    <div className={`${impClass} ${expClass} ${sbxClass}`}>
      {/* BannersWrapper: single sticky block + measures real height → --banners-h */}
      <BannersWrapper>
        <ImpersonationBanner me={me} />
        <SubscriptionExpiryBanner subscription={sub ?? null} />
        <SandboxBanner visible={showSandbox} />
      </BannersWrapper>
      {/* OrderNotifier subscribes to a per-store SSE stream — no point
          mounting it for an admin who has no store of their own. */}
      {data?.store && <OrderNotifier />}
      {/* Surface the active tier to the dashboard sidebar (and any
          other client components that want to gate by plan) without
          prop-drilling through every page. */}
      <PlanProvider value={sub?.plan ?? "free"}>
        <BisnisGateProvider>
          <KdsProvider value={dinein?.kds_enabled ?? false}>{children}</KdsProvider>
        </BisnisGateProvider>
      </PlanProvider>
    </div>
  );
}
