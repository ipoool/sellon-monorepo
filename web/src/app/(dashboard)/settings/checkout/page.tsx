import { serverApi } from "@/lib/server-api";
import { getPlan } from "@/lib/server-auth";
import { CheckoutFieldsManager } from "@/components/dashboard/checkout-fields-manager";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import type { CheckoutConfig, Store } from "@/lib/types";

export const metadata = { title: "Field Checkout — SellOn" };

const DEFAULT_CONFIG: CheckoutConfig = { email_mode: "optional", fields: [] };

export default async function CheckoutFieldsPage() {
  if ((await getPlan()) !== "bisnis") {
    return <UpgradePrompt feature="Custom Field Checkout" />;
  }
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  const config = data?.store?.checkout_config ?? DEFAULT_CONFIG;
  return <CheckoutFieldsManager initial={config} />;
}
