import { serverApi } from "@/lib/server-api";
import { MembershipSettingsForm } from "@/components/dashboard/membership-settings-form";
import type { MembershipTier } from "@/lib/types";

export const metadata = { title: "Pengaturan Membership — SellOn" };

export default async function MembershipSettingsPage() {
  const res = await serverApi<{ tiers: MembershipTier[] }>("/api/v1/membership/tiers");
  return <MembershipSettingsForm initial={res?.tiers ?? []} />;
}
