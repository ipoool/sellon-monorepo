import { serverApi } from "@/lib/server-api";
import { getPlan } from "@/lib/server-auth";
import { LoyaltySettingsForm } from "@/components/dashboard/loyalty-settings-form";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";

export const metadata = { title: "Pengaturan Loyalty — SellOn" };

type LoyaltyConfig = {
  enabled: boolean;
  earn_rate_cents: number;
  redeem_rate_cents: number;
};

export default async function LoyaltySettingsPage() {
  if ((await getPlan()) !== "bisnis") {
    return <UpgradePrompt feature="Loyalti" />;
  }
  const res = await serverApi<{ config: LoyaltyConfig }>("/api/v1/pos/loyalty/config");
  const config = res?.config ?? {
    enabled: false,
    earn_rate_cents: 100000,
    redeem_rate_cents: 100000,
  };

  return <LoyaltySettingsForm initial={config} />;
}
