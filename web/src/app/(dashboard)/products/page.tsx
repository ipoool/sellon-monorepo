import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Package, FileSpreadsheet } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ProductsTable } from "@/components/dashboard/products-table";
import { QuotaBanner } from "@/components/dashboard/quota-banner";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Product, Store, Subscription } from "@/lib/types";

export const metadata = { title: "Produk — SellOn" };

const PAGE_SIZE = 25;

export default async function ProdukListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { q = "", status = "", page: pageParam = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((page - 1) * PAGE_SIZE));

  const [data, storeRes, subRes] = await Promise.all([
    serverApi<{ products: Product[]; total: number }>(
      `/api/v1/products?${params.toString()}`,
    ),
    serverApi<{ store: Store | null }>("/api/v1/store"),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);
  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const storeSlug = storeRes?.store?.slug ?? "";
  const sub = subRes?.subscription;
  const productQuota = sub?.quotas?.products;
  const isCapped = !!productQuota && productQuota.limit > 0;
  const quotaFull = isCapped && productQuota.used >= productQuota.limit;
  const tierLabel =
    sub?.plan === "pro" ? "Pro" : sub?.plan === "bisnis" ? "Bisnis" : "Gratis";

  return (
    <DashboardShell
      me={me}
      pageTitle="Produk"
      pageSubtitle={`${total} produk di katalog`}
      actions={
        <>
          <Link href="/products/bulk-upload">
            <Button size="sm" variant="outline">
              <FileSpreadsheet className="size-4" aria-hidden />
              Upload Massal
            </Button>
          </Link>
          {quotaFull ? (
            <Button
              size="sm"
              disabled
              title="Limit tier Gratis tercapai"
            >
              <Plus className="size-4" aria-hidden />
              Tambah Produk
            </Button>
          ) : (
            <Link href="/products/new">
              <Button size="sm">
                <Plus className="size-4" aria-hidden />
                Tambah Produk
              </Button>
            </Link>
          )}
        </>
      }
    >
      {/* Quota indicator (Free tier only) */}
      {isCapped && productQuota && (
        <QuotaBanner
          label="Kuota produk"
          tierName={tierLabel}
          used={productQuota.used}
          limit={productQuota.limit}
          fullMessage="Limit tercapai. Tambah / duplikat / bulk upload produk akan ditolak sampai upgrade."
        />
      )}

      {/* Filter bar */}
      <form className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Cari nama produk…"
          />
        </div>
        <div className="sm:w-44">
          <Select name="status" defaultValue={status}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
            <option value="sold_out">Stok habis</option>
          </Select>
        </div>
        <Button type="submit" size="md" variant="outline">
          Filter
        </Button>
      </form>

      {products.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Package className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            {q || status ? "Tidak ada produk yang cocok" : "Belum ada produk"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            {q || status
              ? "Coba ubah kata kunci atau filter."
              : "Tambah produk pertamamu — foto + nama + harga sudah cukup untuk mulai."}
          </p>
          {!q && !status && (
            <Link href="/products/new" className="mt-6 inline-block">
              <Button>
                <Plus className="size-4" aria-hidden />
                Tambah Produk Pertama
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <ProductsTable
          products={products}
          storeSlug={storeSlug}
          page={page}
          total={total}
          quotaFull={quotaFull}
        />
      )}
    </DashboardShell>
  );
}
