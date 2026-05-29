import { redirect, notFound } from "next/navigation";

import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { BarcodeSheet } from "@/components/dashboard/barcode-sheet";
import type { Product } from "@/lib/types";

export const metadata = {
  title: "Barcode Produk — SellOn",
  robots: { index: false, follow: false },
};

export default async function BarcodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { id } = await params;
  const res = await serverApi<{ product: Product }>(`/api/v1/products/${id}`);
  if (!res?.product) notFound();

  return <BarcodeSheet product={res.product} />;
}
