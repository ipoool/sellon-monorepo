import { redirect } from "next/navigation";

import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { PengirimanForm } from "@/components/dashboard/pengiriman-form";

export const metadata = { title: "Pengiriman — SellOn" };

export default async function PengaturanPengirimanPage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  const store = data?.store ?? null;
  if (!store) redirect("/dasbor/pengaturan/toko");
  return <PengirimanForm initial={store} />;
}
