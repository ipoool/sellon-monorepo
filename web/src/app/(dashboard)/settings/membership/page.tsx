import { serverApi } from "@/lib/server-api";
import { getPlan } from "@/lib/server-auth";
import { MembershipSettingsForm } from "@/components/dashboard/membership-settings-form";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import type { MembershipTier } from "@/lib/types";

export const metadata = { title: "Pengaturan Membership — SellOn" };

export default async function MembershipSettingsPage() {
  if ((await getPlan()) !== "bisnis") {
    return <UpgradePrompt feature="Membership" />;
  }
  const res = await serverApi<{ tiers: MembershipTier[] }>("/api/v1/membership/tiers");
  return <MembershipSettingsForm initial={res?.tiers ?? []} />;
}
