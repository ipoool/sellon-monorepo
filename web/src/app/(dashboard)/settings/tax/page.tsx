import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { TaxForm } from "@/components/dashboard/tax-form";

export const metadata = { title: "Pajak / PPN — SellOn" };

export default async function PengaturanPajakPage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  return <TaxForm initial={data?.store ?? null} />;
}
