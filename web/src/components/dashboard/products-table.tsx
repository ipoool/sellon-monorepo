"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Package, Trash2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ShareProductButton } from "@/components/dashboard/share-product-button";
import { ProductRowActions } from "@/components/dashboard/product-row-actions";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/dashboard/table-pagination";
import { formatRupiah, formatDateID } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const statusBadge: Record<
  Product["status"],
  { variant: "success" | "default" | "warning"; label: string }
> = {
  active: { variant: "success", label: "Aktif" },
  inactive: { variant: "default", label: "Nonaktif" },
  sold_out: { variant: "warning", label: "Stok habis" },
};

type Props = {
  products: Product[];
  storeSlug: string;
  page: number;
  total: number;
  quotaFull?: boolean;
};

export function ProductsTable({
  products,
  storeSlug,
  page,
  total,
  quotaFull,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Memoized helpers for "select all on this page" checkbox state.
  // `all` is checked when every row on this page is selected, else
  // `some` to render the indeterminate state.
  const { allSelected, someSelected } = useMemo(() => {
    const ids = products.map((p) => p.id);
    const picked = ids.filter((id) => selected.has(id)).length;
    return {
      allSelected: ids.length > 0 && picked === ids.length,
      someSelected: picked > 0 && picked < ids.length,
    };
  }, [products, selected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const idsOnPage = products.map((p) => p.id);
      const allOnPagePicked = idsOnPage.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOnPagePicked) {
        idsOnPage.forEach((id) => next.delete(id));
      } else {
        idsOnPage.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function performDelete() {
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const res = await fetch(`${apiBase}/api/v1/products/bulk-delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        deleted?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const deleted = data.deleted ?? 0;
      const failed = data.failed ?? 0;
      if (deleted > 0) {
        showSuccess(
          failed > 0
            ? `${deleted} produk dihapus, ${failed} gagal.`
            : `${deleted} produk dihapus.`,
        );
      } else {
        showError("Tidak ada produk yang berhasil dihapus.");
      }
      setSelected(new Set());
      setShowConfirm(false);
      router.refresh();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-4">
      {/* Selection toolbar — muncul kalau ada produk dipilih. */}
      {selectedCount > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-neutral-900">
            <span className="font-mono">{selectedCount}</span>{" "}
            produk dipilih
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={busy}
            >
              Batal pilih
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setShowConfirm(true)}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
              Hapus {selectedCount} produk
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Pilih semua produk di halaman ini"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="size-4 cursor-pointer rounded border-neutral-300 text-brand-600 accent-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
              </th>
              <th className="px-5 py-3">Produk</th>
              <th className="px-5 py-3">Harga</th>
              <th className="px-5 py-3">Stok</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Dibuat</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {products.map((p) => {
              const isPicked = selected.has(p.id);
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "hover:bg-neutral-50",
                    isPicked && "bg-brand-50/30 hover:bg-brand-50/40",
                  )}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${p.name}`}
                      checked={isPicked}
                      onChange={() => toggleOne(p.id)}
                      className="size-4 cursor-pointer rounded border-neutral-300 text-brand-600 accent-brand-600 focus:ring-2 focus:ring-brand-500/30"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                        {p.photo_urls[0] ? (
                          <Image
                            src={p.photo_urls[0]}
                            alt={p.name}
                            width={40}
                            height={40}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package
                            className="size-5 text-neutral-400"
                            aria-hidden
                          />
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
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {p.product_type === "digital" ? (
                        <span className="text-neutral-500">—</span>
                      ) : p.has_variants ? (
                        <span className="text-neutral-700">
                          {p.variants_count ?? 0} varian · stok{" "}
                          {p.variants_stock ?? 0}
                        </span>
                      ) : (
                        <span className="text-neutral-700">{p.stock}</span>
                      )}
                      {p.product_type !== "digital" &&
                        !p.has_variants &&
                        p.low_stock_threshold > 0 &&
                        p.stock <= p.low_stock_threshold &&
                        p.stock > 0 && (
                          <Badge variant="warning">Stok rendah</Badge>
                        )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={statusBadge[p.status].variant}>
                      {statusBadge[p.status].label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {formatDateID(p.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {storeSlug && (
                        <ShareProductButton
                          storeSlug={storeSlug}
                          productSlug={p.slug}
                          productName={p.name}
                        />
                      )}
                      <ProductRowActions
                        productId={p.id}
                        productName={p.name}
                        storeSlug={storeSlug}
                        quotaFull={quotaFull}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={page}
        pageSize={TABLE_PAGE_SIZE}
        total={total}
        paramName="page"
      />

      <ConfirmDialog
        open={showConfirm}
        onClose={() => !busy && setShowConfirm(false)}
        onConfirm={performDelete}
        title={`Hapus ${selectedCount} produk?`}
        kind="danger"
        confirmLabel={`Hapus ${selectedCount} produk`}
        cancelLabel="Batal"
        busy={busy}
        confirmIcon={<Trash2 className="size-4" aria-hidden />}
        requireTypedPhrase="DELETE ALL"
        description={
          <div className="space-y-2">
            <p>
              Aksi ini akan menghapus{" "}
              <strong className="text-neutral-900">{selectedCount} produk</strong>{" "}
              beserta varian-nya secara permanen. Riwayat pesanan yang sudah
              ada tetap aman.
            </p>
            <p className="text-danger">
              Tindakan ini <strong>tidak bisa dibatalkan</strong>.
            </p>
          </div>
        }
      />
    </div>
  );
}
