import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <div className="mb-4">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke daftar produk
        </Link>
      </div>
      <ProdukForm initial={data.product} />
    </DashboardShell>
  );
}
