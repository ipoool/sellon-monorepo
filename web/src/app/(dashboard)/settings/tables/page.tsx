import { serverApi } from "@/lib/server-api";
import { TablesManager } from "@/components/dashboard/tables-manager";
import type { RestaurantTable, DineInSettings } from "@/lib/types";

export const metadata = { title: "Meja & QR — SellOn" };

export default async function TablesSettingsPage() {
  const [tablesRes, dineinRes] = await Promise.all([
    serverApi<{ tables: RestaurantTable[] }>("/api/v1/tables"),
    serverApi<DineInSettings>("/api/v1/store/dinein"),
  ]);

  return (
    <TablesManager
      initialTables={tablesRes?.tables ?? []}
      initialSettings={dineinRes ?? { enabled: false, payment_mode: "cashier", kds_enabled: false }}
    />
  );
}
