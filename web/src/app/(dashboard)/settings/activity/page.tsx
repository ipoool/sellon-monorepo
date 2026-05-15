import { ActivityLog } from "@/components/dashboard/activity-log";
import { serverApi } from "@/lib/server-api";
import type { AuditEntry } from "@/lib/types";

export const metadata = { title: "Aktivitas — SellOn" };

type SearchParams = Promise<{
  since?: string;
  until?: string;
}>;

function buildQuery(params: { since?: string; until?: string }): string {
  const sp = new URLSearchParams();
  sp.set("limit", "50");
  if (params.since) sp.set("since", params.since);
  if (params.until) sp.set("until", params.until);
  return sp.toString();
}

export default async function PengaturanAktivitasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const since = params.since ?? "";
  const until = params.until ?? "";

  const data = await serverApi<{ entries: AuditEntry[] }>(
    `/api/v1/audit-log?${buildQuery({ since, until })}`,
  );
  const initial = data?.entries ?? [];

  return (
    <ActivityLog
      initial={initial}
      filter={{ since, until }}
    />
  );
}
