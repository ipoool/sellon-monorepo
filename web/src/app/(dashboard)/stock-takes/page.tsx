import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StockTakeManager } from "@/components/dashboard/stock-take-manager";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { StockTake } from "@/lib/types";

export const metadata = { title: "Stok Opname — SellOn" };

export default async function StockTakesPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const res = await serverApi<{ stock_takes: StockTake[] }>("/api/v1/stock-takes");

  return (
    <DashboardShell
      me={me}
      pageTitle="Stok Opname"
      pageSubtitle="Hitung stok fisik vs sistem. Selisihnya otomatis jadi penyesuaian stok bahan."
    >
      <StockTakeManager initial={res?.stock_takes ?? []} />
    </DashboardShell>
  );
}
