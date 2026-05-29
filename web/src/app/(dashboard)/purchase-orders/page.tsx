import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PurchaseOrdersManager } from "@/components/dashboard/purchase-orders-manager";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { PurchaseOrder, Supplier, Material } from "@/lib/types";

export const metadata = { title: "Pembelian — SellOn" };

export default async function PurchaseOrdersPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const [poRes, supRes, matRes] = await Promise.all([
    serverApi<{ purchase_orders: PurchaseOrder[] }>("/api/v1/purchase-orders"),
    serverApi<{ suppliers: Supplier[] }>("/api/v1/suppliers"),
    serverApi<{ materials: Material[] }>("/api/v1/materials?limit=200"),
  ]);

  return (
    <DashboardShell
      me={me}
      pageTitle="Pembelian / Purchase Order"
      pageSubtitle="Catat pembelian bahan ke supplier. Saat diterima, stok bahan otomatis bertambah."
    >
      <PurchaseOrdersManager
        initialPOs={poRes?.purchase_orders ?? []}
        suppliers={supRes?.suppliers ?? []}
        materials={matRes?.materials ?? []}
      />
    </DashboardShell>
  );
}
