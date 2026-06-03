import { serverApi } from "@/lib/server-api";
import { getPlan } from "@/lib/server-auth";
import { MetaSettingsForm, type MetaConfig } from "@/components/dashboard/meta-settings-form";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";

export const metadata = { title: "Integrasi Meta — SellOn" };

export default async function MetaSettingsPage() {
  // Pro+ feature — only Free is blocked.
  if ((await getPlan()) === "free") {
    return <UpgradePrompt feature="Integrasi Meta (Facebook & Instagram)" tier="pro" />;
  }
  const config = await serverApi<MetaConfig>("/api/v1/store/meta");
  return <MetaSettingsForm initial={config ?? null} />;
}
