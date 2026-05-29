import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, Truck } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { MaterialsManager } from "@/components/dashboard/materials-manager";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type { Material } from "@/lib/types";

type Summary = { item_count: number; total_value_cents: number; low_stock_count: number };

export const metadata = { title: "Bahan Baku — SellOn" };

const PAGE_SIZE = 20;
const SORTS = ["name", "stock_asc", "stock_desc"];

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const sort = SORTS.includes(sp.sort ?? "") ? (sp.sort as string) : "name";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const params = new URLSearchParams({
    include_inactive: "0",
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sort,
  });
  if (q) params.set("q", q);

  const [data, summary] = await Promise.all([
    serverApi<{ materials: Material[]; total: number }>(`/api/v1/materials?${params}`),
    serverApi<Summary>("/api/v1/materials/summary"),
  ]);
  const materials = data?.materials ?? [];
  const total = data?.total ?? 0;

  return (
    <DashboardShell
      me={me}
      pageTitle="Bahan Baku"
      pageSubtitle="Stok bahan & packaging untuk produk yang kamu jual"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/stock-takes">
            <Button size="sm" variant="outline">
              <ClipboardCheck className="size-4" aria-hidden />
              <span className="hidden sm:inline">Stok Opname</span>
            </Button>
          </Link>
          <Link href="/purchase-orders">
            <Button size="sm" variant="outline">
              <Truck className="size-4" aria-hidden />
              <span className="hidden sm:inline">Pembelian</span>
            </Button>
          </Link>
        </div>
      }
    >
      {summary && summary.item_count > 0 && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Stat label="Nilai Stok" value={formatRupiah(summary.total_value_cents)} />
          <Stat label="Jenis Bahan" value={String(summary.item_count)} />
          <Stat label="Stok Menipis" value={String(summary.low_stock_count)} />
        </div>
      )}
      <MaterialsManager
        initial={materials}
        total={total}
        q={q}
        sort={sort}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </DashboardShell>
  );
}
