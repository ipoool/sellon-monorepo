import { redirect } from "next/navigation";

import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { StorefrontForm } from "@/components/dashboard/storefront-form";

export const metadata = { title: "Storefront — SellOn" };

export default async function PengaturanStorefrontPage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  const store = data?.store;
  if (!store) redirect("/dasbor/pengaturan/toko");
  return <StorefrontForm initial={store} />;
}
