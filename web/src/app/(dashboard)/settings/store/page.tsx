import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { TokoForm } from "@/components/dashboard/toko-form";

export const metadata = { title: "Profil Toko — SellOn" };

export default async function PengaturanTokoPage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  const store = data?.store ?? null;

  return <TokoForm initial={store} />;
}
