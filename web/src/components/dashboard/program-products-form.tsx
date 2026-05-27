"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import type { Product, ProgramProduct } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type RowState = {
  productId: string;
  isInProgram: boolean;
  modalCents: number;
};

export function ProgramProductsForm({
  programId,
  allProducts,
  programProducts,
}: {
  programId: string;
  allProducts: Product[];
  programProducts: ProgramProduct[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  // Build a map: product_id → existing program entry (if any).
  const programMap = useMemo(() => {
    const m = new Map<string, ProgramProduct>();
    for (const pp of programProducts) m.set(pp.product_id, pp);
    return m;
  }, [programProducts]);

  // Build initial row state for every seller product.
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const p of allProducts) {
      const existing = programMap.get(p.id);
      init[p.id] = {
        productId: p.id,
        isInProgram: existing?.is_active ?? false,
        modalCents: existing?.reseller_price_cents ?? Math.floor(p.price_cents * 0.7),
      };
    }
    return init;
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, allProducts]);

  const updateRow = (productId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
  };

  const activeCount = Object.values(rows).filter((r) => r.isInProgram).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send active products (others get inactivated by backend if previously active).
      const products = Object.values(rows)
        .filter((r) => r.isInProgram)
        .map((r) => ({
          product_id: r.productId,
          reseller_price_cents: r.modalCents,
          is_active: true,
        }));
      const res = await fetch(`${apiBase}/api/v1/reseller/programs/${programId}/products`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal menyimpan");
        return;
      }
      showSuccess(`${products.length} produk tersimpan ke program`);
      router.refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  if (allProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
        <Package className="size-8 text-neutral-400" aria-hidden />
        <div>
          <p className="font-semibold text-neutral-900">Belum ada produk di toko kamu</p>
          <p className="mt-1 text-sm text-neutral-500">
            Tambahkan produk dulu di menu Produk, lalu kembali ke sini untuk masukkan ke program reseller.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            <strong className="text-neutral-900">{activeCount}</strong> dari {allProducts.length} produk aktif
          </span>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-4" aria-hidden />
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-500 w-12">Aktif</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Produk</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-500">Harga Jual Toko</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-500">Harga Modal Reseller</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((product) => {
              const row = rows[product.id];
              const margin = product.price_cents - row.modalCents;
              return (
                <tr key={product.id} className={!row.isInProgram ? "opacity-50" : ""}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={row.isInProgram}
                      onChange={(e) => updateRow(product.id, { isInProgram: e.target.checked })}
                      className="size-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500/30"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.photo_urls?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.photo_urls[0]}
                          alt={product.name}
                          className="size-10 shrink-0 rounded-md border border-neutral-200 object-cover"
                        />
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50">
                          <Package className="size-4 text-neutral-400" aria-hidden />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900">{product.name}</p>
                        <p className="text-xs text-neutral-500">Stok: {product.stock}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-600">
                    {formatRupiah(product.price_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                          Rp
                        </span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={
                            row.modalCents > 0
                              ? Math.floor(row.modalCents / 100).toLocaleString("id-ID")
                              : ""
                          }
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            const rupiah = digits === "" ? 0 : parseInt(digits, 10);
                            updateRow(product.id, { modalCents: rupiah * 100 });
                          }}
                          disabled={!row.isInProgram}
                          className="h-8 w-36 pl-9 text-right text-sm"
                          placeholder="0"
                        />
                      </div>
                      {row.isInProgram && (
                        <span className={`text-xs ${margin >= 0 ? "text-neutral-500" : "text-danger"}`}>
                          {margin >= 0
                            ? `Potongan untuk reseller: ${formatRupiah(margin)}`
                            : `Modal di atas harga jual (${formatRupiah(margin)})`}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">Tidak ada produk yang cocok.</p>
        )}
      </div>

      <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-600">
        💡 <strong>Harga modal reseller</strong> adalah harga yang reseller bayar ke kamu. Reseller akan
        set harga jual sendiri yang harus ≥ harga modal ini.
      </div>
    </div>
  );
}
