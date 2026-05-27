import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { ProgramProductsForm } from "@/components/dashboard/program-products-form";
import type { Product, ProgramProduct, ResellerProgram } from "@/lib/types";

export const metadata = { title: "Kelola Produk Program — SellOn" };

export default async function ProgramProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { id } = await params;

  const [programRes, productsRes, programProductsRes] = await Promise.all([
    serverApi<{ program: ResellerProgram }>(`/api/v1/reseller/programs/${id}`),
    serverApi<{ products: Product[]; total: number }>("/api/v1/products?limit=200"),
    serverApi<{ products: ProgramProduct[] }>(`/api/v1/reseller/programs/${id}/products`),
  ]);

  if (!programRes?.program) notFound();

  const program = programRes.program;
  const allProducts = productsRes?.products ?? [];
  const programProducts = programProductsRes?.products ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle={`Kelola Produk: ${program.name}`}
      pageSubtitle="Pilih produk yang tersedia untuk reseller + set harga modal"
    >
      <div className="mb-4">
        <Link
          href="/reseller/program"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Kembali ke daftar program
        </Link>
      </div>

      <ProgramProductsForm
        programId={program.id}
        allProducts={allProducts}
        programProducts={programProducts}
      />
    </DashboardShell>
  );
}
