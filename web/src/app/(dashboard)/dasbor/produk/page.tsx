import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Package, FileSpreadsheet } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { Product } from "@/lib/types";

export const metadata = { title: "Produk — SellOn" };

const statusBadge: Record<Product["status"], { variant: "success" | "default" | "warning"; label: string }> = {
  active: { variant: "success", label: "Aktif" },
  inactive: { variant: "default", label: "Nonaktif" },
  sold_out: { variant: "warning", label: "Stok habis" },
};

export default async function ProdukListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/masuk");
  const { q = "", status = "" } = await searchParams;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const data = await serverApi<{ products: Product[]; total: number }>(
    `/api/v1/products${qs}`,
  );
  const products = data?.products ?? [];
  const total = data?.total ?? 0;

  return (
    <DashboardShell
      me={me}
      pageTitle="Produk"
      pageSubtitle={`${total} produk di katalog`}
      actions={
        <>
          <Link href="/dasbor/produk/bulk-upload">
            <Button size="sm" variant="outline">
              <FileSpreadsheet className="size-4" aria-hidden />
              Upload Massal
            </Button>
          </Link>
          <Link href="/dasbor/produk/baru">
            <Button size="sm">
              <Plus className="size-4" aria-hidden />
              Tambah Produk
            </Button>
          </Link>
        </>
      }
    >
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
            <Link href="/dasbor/produk/baru" className="mt-6 inline-block">
              <Button>
                <Plus className="size-4" aria-hidden />
                Tambah Produk Pertama
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3">Produk</th>
                <th className="px-5 py-3">Harga</th>
                <th className="px-5 py-3">Stok</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Dibuat</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                        {p.photo_urls[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.photo_urls[0]}
                            alt={p.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package className="size-5 text-neutral-400" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {p.slug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-medium text-neutral-900">
                    {formatRupiah(p.price_cents)}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{p.stock}</td>
                  <td className="px-5 py-3">
                    <Badge variant={statusBadge[p.status].variant}>
                      {statusBadge[p.status].label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {formatDateID(p.created_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/dasbor/produk/${p.id}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
