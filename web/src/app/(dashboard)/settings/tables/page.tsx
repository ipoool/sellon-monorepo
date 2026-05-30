import { serverApi } from "@/lib/server-api";
import { TablesManager } from "@/components/dashboard/tables-manager";
import type { RestaurantTable, DineInSettings, Store } from "@/lib/types";

export const metadata = { title: "Meja & QR — SellOn" };

export default async function TablesSettingsPage() {
  const [tablesRes, dineinRes, storeRes] = await Promise.all([
    serverApi<{ tables: RestaurantTable[] }>("/api/v1/tables"),
    serverApi<DineInSettings>("/api/v1/store/dinein"),
    serverApi<{ store: Store | null }>("/api/v1/store"),
  ]);

  return (
    <TablesManager
      initialTables={tablesRes?.tables ?? []}
      storeName={storeRes?.store?.name ?? ""}
      storeSlug={storeRes?.store?.slug ?? ""}
      initialSettings={
        dineinRes ?? {
          enabled: false,
          payment_mode: "cashier",
          kds_enabled: false,
          qr_layout: "classic",
          qr_fg_color: "#FFFFFF",
          qr_bg_color: "#1E3A8A",
          qr_headline: "",
          qr_caption: "Scan untuk pesan",
        }
      }
    />
  );
}
