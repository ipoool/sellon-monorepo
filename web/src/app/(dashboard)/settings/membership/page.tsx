import { serverApi } from "@/lib/server-api";
import { hasFeature } from "@/lib/server-auth";
import { MembershipSettingsForm } from "@/components/dashboard/membership-settings-form";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import type { MembershipTier } from "@/lib/types";

export const metadata = { title: "Pengaturan Membership" };

export default async function MembershipSettingsPage() {
  if (!(await hasFeature("membership"))) {
    return <UpgradePrompt feature="Membership" />;
  }
  const res = await serverApi<{ tiers: MembershipTier[] }>("/api/v1/membership/tiers");
  return <MembershipSettingsForm initial={res?.tiers ?? []} />;
}
