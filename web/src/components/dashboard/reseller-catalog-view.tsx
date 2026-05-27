"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Trash2, Edit3, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import type { ResellerCatalogEntry, ResellerMembership, ProgramProduct } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Tab = "available" | "imported";

function ImportModal({
  product,
  membershipID,
  onImported,
  onClose,
}: {
  product: ProgramProduct;
  membershipID: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const [priceCents, setPriceCents] = useState(Math.ceil(product.reseller_price_cents * 1.3));
  const [loading, setLoading] = useState(false);

  const margin = priceCents - product.reseller_price_cents;
  const marginPct = product.reseller_price_cents > 0
    ? Math.round((margin / product.reseller_price_cents) * 100)
    : 0;

  const handleImport = async () => {
    if (priceCents < product.reseller_price_cents) {
      showError("Harga jual tidak boleh lebih rendah dari harga modal");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/reseller/catalog`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membership_id: membershipID,
          program_product_id: product.id,
          reseller_price_cents: priceCents,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal import produk");
        return;
      }
      showSuccess(`${product.product_name} berhasil diimport ke katalog`);
      onImported();
    } catch {
      showError("Gagal import produk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-popout">
        <h3 className="font-display text-lg font-semibold text-neutral-900">Import Produk</h3>
        <p className="mt-1 text-sm text-neutral-500">{product.product_name}</p>

        <div className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          <span className="text-neutral-500">Harga modal (dari supplier):</span>{" "}
          <span className="font-semibold text-neutral-900">{formatRupiah(product.reseller_price_cents)}</span>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">Harga jual kamu</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
              Rp
            </span>
            <Input
              type="text"
              inputMode="numeric"
              value={priceCents > 0 ? Math.floor(priceCents / 100).toLocaleString("id-ID") : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                const rupiah = digits === "" ? 0 : parseInt(digits, 10);
                setPriceCents(rupiah * 100);
              }}
              className="pl-10"
              placeholder="0"
            />
          </div>
          {priceCents >= product.reseller_price_cents && (
            <p className={`text-xs ${margin >= 0 ? "text-brand-600" : "text-danger"}`}>
              Margin: {formatRupiah(margin)} ({marginPct}%)
            </p>
          )}
          {priceCents < product.reseller_price_cents && (
            <p className="text-xs text-danger">
              Harga harus ≥ {formatRupiah(product.reseller_price_cents)}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Batal
          </Button>
          <Button
            className="flex-1"
            onClick={handleImport}
            disabled={loading || priceCents < product.reseller_price_cents}
          >
            {loading ? "Menyimpan..." : "Import ke Katalog"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ResellerCatalogView({
  catalog: initialCatalog,
  memberships,
  activeMembershipID,
  availableProducts: initialAvailable,
}: {
  catalog: ResellerCatalogEntry[];
  memberships: ResellerMembership[];
  activeMembershipID?: string;
  availableProducts: ProgramProduct[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(activeMembershipID ? "available" : "imported");
  const [catalog, setCatalog] = useState(initialCatalog);
  const [available] = useState(initialAvailable);
  const [importTarget, setImportTarget] = useState<ProgramProduct | null>(null);
  const [selectedMembership, setSelectedMembership] = useState(activeMembershipID ?? memberships[0]?.id ?? "");

  const importedProductIDs = new Set(catalog.map((e) => e.product_id));

  const handleRemove = async (catalogID: string, name: string) => {
    if (!confirm(`Hapus "${name}" dari katalog?`)) return;
    try {
      await fetch(`${apiBase}/api/v1/reseller/catalog/${catalogID}`, {
        method: "DELETE",
        credentials: "include",
      });
      setCatalog((prev) => prev.filter((e) => e.id !== catalogID));
      showSuccess("Produk dihapus dari katalog");
    } catch {
      showError("Gagal menghapus produk");
    }
  };

  const handleMembershipChange = (mid: string) => {
    setSelectedMembership(mid);
    router.push(`/reseller/catalog?membership=${mid}`);
  };

  return (
    <>
      {importTarget && selectedMembership && (
        <ImportModal
          product={importTarget}
          membershipID={selectedMembership}
          onImported={() => {
            setImportTarget(null);
            router.refresh();
          }}
          onClose={() => setImportTarget(null)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1 w-fit">
        <button
          onClick={() => setTab("available")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "available"
              ? "bg-white text-neutral-900 shadow-soft"
              : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          Produk Supplier
        </button>
        <button
          onClick={() => setTab("imported")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "imported"
              ? "bg-white text-neutral-900 shadow-soft"
              : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          Katalog Saya ({catalog.length})
        </button>
      </div>

      {/* Available products from supplier */}
      {tab === "available" && (
        <div className="flex flex-col gap-4">
          {memberships.length > 1 && (
            <select
              value={selectedMembership}
              onChange={(e) => handleMembershipChange(e.target.value)}
              className="w-fit rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.supplier_store_name} — {m.program_name}
                </option>
              ))}
            </select>
          )}

          {available.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 bg-white py-12 text-center text-sm text-neutral-500">
              Tidak ada produk tersedia dari supplier ini.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((product) => {
                const alreadyImported = importedProductIDs.has(product.product_id);
                return (
                  <div
                    key={product.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
                  >
                    <div className="flex h-32 items-center justify-center bg-neutral-100">
                      {product.photo_urls?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.photo_urls[0]}
                          alt={product.product_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="size-8 text-neutral-400" aria-hidden />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <p className="text-sm font-medium text-neutral-900 line-clamp-2">
                        {product.product_name}
                      </p>
                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>Modal: <strong className="text-neutral-700">{formatRupiah(product.reseller_price_cents)}</strong></span>
                        <span>Stok: {product.stock}</span>
                      </div>
                      {alreadyImported ? (
                        <div className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
                          <Check className="size-3.5" aria-hidden />
                          Sudah di katalog
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setImportTarget(product)}
                          disabled={product.stock === 0}
                        >
                          {product.stock === 0 ? "Stok Habis" : "Import ke Katalog"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Imported catalog */}
      {tab === "imported" && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          {catalog.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">
              Belum ada produk yang diimport. Pilih tab "Produk Supplier" untuk mulai.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Produk</th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-500">Modal</th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-500">Harga Jual</th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-500">Stok</th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-500">Supplier</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {catalog.map((entry) => (
                  <tr key={entry.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">{entry.product_name}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{formatRupiah(entry.modal_cents)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                      {formatRupiah(entry.reseller_price_cents)}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600">{entry.stock}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{entry.supplier_store_name}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(entry.id, entry.product_name)}
                        className="rounded p-1 text-neutral-400 transition-colors hover:bg-danger/10 hover:text-danger"
                        title="Hapus dari katalog"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
