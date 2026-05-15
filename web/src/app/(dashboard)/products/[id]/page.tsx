import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProdukForm } from "@/components/dashboard/produk-form";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Product } from "@/lib/types";

export const metadata = { title: "Edit Produk — SellOn" };

export default async function ProdukEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { id } = await params;

  const data = await serverApi<{ product: Product }>(`/api/v1/products/${id}`);
  if (!data?.product) notFound();

  return (
    <DashboardShell
      me={me}
      pageTitle={data.product.name}
      pageSubtitle="Edit produk"
    >
      <ProdukForm initial={data.product} />
    </DashboardShell>
  );
}
