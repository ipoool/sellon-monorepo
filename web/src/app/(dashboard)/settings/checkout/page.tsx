import { serverApi } from "@/lib/server-api";
import { CheckoutFieldsManager } from "@/components/dashboard/checkout-fields-manager";
import type { CheckoutConfig, Store } from "@/lib/types";

export const metadata = { title: "Field Checkout — SellOn" };

const DEFAULT_CONFIG: CheckoutConfig = { email_mode: "optional", fields: [] };

export default async function CheckoutFieldsPage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  const config = data?.store?.checkout_config ?? DEFAULT_CONFIG;
  return <CheckoutFieldsManager initial={config} />;
}
