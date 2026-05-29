import { redirect } from "next/navigation";

import { KitchenBoard } from "@/components/pos/kitchen-board";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { KitchenOrder } from "@/lib/types";

export const metadata = { title: "Kitchen Display — SellOn" };

// KDS is a fullscreen board — no dashboard chrome.
export default async function KDSPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  const res = await serverApi<{ orders: KitchenOrder[] }>("/api/v1/kds/orders");
  return <KitchenBoard initial={res?.orders ?? []} />;
}
