import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OrderNotifier } from "@/components/dashboard/order-notifier";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";

// Guards all routes under (dashboard): must be authed AND have a store.
// First-time users (authed but no store yet) get sent to /setup.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await getMe();
  if (!me) redirect("/masuk");

  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  if (!data?.store) redirect("/setup");

  return (
    <>
      <OrderNotifier />
      {children}
    </>
  );
}
