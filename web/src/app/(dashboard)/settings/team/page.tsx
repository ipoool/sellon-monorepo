import { StaffManager } from "@/components/dashboard/staff-manager";
import { serverApi } from "@/lib/server-api";
import type { StaffData } from "@/lib/types";

export const metadata = { title: "Tim — SellOn" };

export default async function PengaturanTimPage() {
  const data = await serverApi<StaffData>("/api/v1/staff");
  const initial: StaffData = data ?? {
    members: [],
    invites: [],
    staff_limit: 1,
    members_used: 0,
  };
  return <StaffManager initial={initial} />;
}
