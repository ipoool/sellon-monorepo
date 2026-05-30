import { redirect } from "next/navigation";

import { KitchenBoard } from "@/components/pos/kitchen-board";
import { getMe, getPlan } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { DineInSettings, KitchenOrder } from "@/lib/types";

export const metadata = { title: "Kitchen Display — SellOn" };

// KDS is a fullscreen board — no dashboard chrome.
export default async function KDSPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  // Dine-in / KDS is a Bisnis feature.
  if ((await getPlan()) !== "bisnis") redirect("/settings/subscription");
  // The board only exists when the seller turned KDS on in Meja & QR settings.
  // With it off, dine-in orders skip the kitchen pipeline entirely, so there's
  // nothing to display — send them to the setting instead.
  const settings = await serverApi<DineInSettings>("/api/v1/store/dinein");
  if (!settings?.kds_enabled) redirect("/settings/tables");
  const res = await serverApi<{ orders: KitchenOrder[] }>("/api/v1/kds/orders");
  return <KitchenBoard initial={res?.orders ?? []} />;
}
