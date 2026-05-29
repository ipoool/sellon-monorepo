import { serverApi } from "@/lib/server-api";
import { LoyaltySettingsForm } from "@/components/dashboard/loyalty-settings-form";

export const metadata = { title: "Pengaturan Loyalty — SellOn" };

type LoyaltyConfig = {
  enabled: boolean;
  earn_rate_cents: number;
  redeem_rate_cents: number;
};

export default async function LoyaltySettingsPage() {
  const res = await serverApi<{ config: LoyaltyConfig }>("/api/v1/pos/loyalty/config");
  const config = res?.config ?? {
    enabled: false,
    earn_rate_cents: 100000,
    redeem_rate_cents: 100000,
  };

  return <LoyaltySettingsForm initial={config} />;
}
