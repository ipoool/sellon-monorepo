import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { MenuVisibilityForm } from "@/components/dashboard/menu-visibility-form";

export const metadata = { title: "Tampilan Menu — SellOn" };

export default async function PengaturanMenuPage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  return <MenuVisibilityForm initial={data?.store ?? null} />;
}
