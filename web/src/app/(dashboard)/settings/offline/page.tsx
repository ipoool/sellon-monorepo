import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { OfflineModeForm } from "@/components/dashboard/offline-mode-form";

export const metadata = { title: "Mode Offline — SellOn" };

export default async function PengaturanOfflinePage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  return <OfflineModeForm initial={data?.store ?? null} />;
}
