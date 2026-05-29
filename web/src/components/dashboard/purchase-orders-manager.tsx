"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Truck, PackageCheck, X, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import { formatDateID } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import type { PurchaseOrder, Supplier, Material } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const statusMeta: Record<
  PurchaseOrder["status"],
  { label: string; variant: "default" | "brand" | "success" | "warning" }
> = {
  draft: { label: "Draft", variant: "default" },
  ordered: { label: "Dipesan", variant: "warning" },
  received: { label: "Diterima", variant: "success" },
  cancelled: { label: "Dibatalkan", variant: "default" },
};

type Line = { material_id: string; quantity: number; unitCostRupiah: number };

export function PurchaseOrdersManager({
  initialPOs,
  suppliers,
  materials,
}: {
  initialPOs: PurchaseOrder[];
  suppliers: Supplier[];
  materials: Material[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ material_id: "", quantity: 1, unitCostRupiah: 0 }]);

  const total = lines.reduce(
    (sum, l) => sum + (l.material_id ? l.quantity * l.unitCostRupiah : 0),
    0,
  );

  const reset = () => {
    setSupplierId("");
    setNote("");
    setLines([{ material_id: "", quantity: 1, unitCostRupiah: 0 }]);
    setCreating(false);
  };

  const save = async () => {
    const items = lines
      .filter((l) => l.material_id && l.quantity > 0)
      .map((l) => ({
        material_id: l.material_id,
        quantity: Math.round(l.quantity),
        unit_cost_cents: Math.max(0, Math.round(l.unitCostRupiah)) * 100,
      }));
    if (items.length === 0) {
      showError("Tambah minimal 1 bahan");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/purchase-orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, note: note.trim(), items }),
      });
      if (res.status === 402) {
        showError("Fitur pembelian hanya untuk plan Pro/Bisnis");
        return;
      }
      if (!res.ok) {
        showError("Gagal membuat PO");
        return;
      }
      showSuccess("Purchase order dibuat");
      reset();
      router.refresh();
    } catch {
      showError("Gagal membuat PO");
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: "receive" | "ordered") => {
    setBusy(true);
    try {
      const url =
        action === "receive"
          ? `${apiBase}/api/v1/purchase-orders/${id}/receive`
          : `${apiBase}/api/v1/purchase-orders/${id}/status`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: action === "ordered" ? JSON.stringify({ status: "ordered" }) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal memproses");
        return;
      }
      showSuccess(action === "receive" ? "PO diterima — stok bertambah" : "PO ditandai dipesan");
      router.refresh();
    } catch {
      showError("Gagal memproses");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">{initialPOs.length} purchase order</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Buat PO
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">Purchase Order Baru</h2>
            <button onClick={reset} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label="Tutup">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Supplier (opsional)</span>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— tanpa supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Catatan</span>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. belanja mingguan" />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={l.material_id}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, material_id: e.target.value } : x)))
                  }
                  className="flex-1"
                >
                  <option value="">— pilih bahan —</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.base_unit})</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={l.quantity || ""}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: parseInt(e.target.value, 10) || 0 } : x)))
                  }
                  placeholder="Qty"
                  className="w-20 text-right"
                />
                <div className="relative w-32">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">Rp</span>
                  <Input
                    inputMode="numeric"
                    value={l.unitCostRupiah ? l.unitCostRupiah.toLocaleString("id-ID") : ""}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((x, j) => (j === i ? { ...x, unitCostRupiah: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 } : x)),
                      )
                    }
                    placeholder="Modal/satuan"
                    className="pl-7 text-right"
                  />
                </div>
                <button
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                  aria-label="Hapus baris"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLines((ls) => [...ls, { material_id: "", quantity: 1, unitCostRupiah: 0 }])}
              >
                <Plus className="size-4" aria-hidden />
                Tambah Bahan
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
            <span className="text-sm text-neutral-500">
              Total: <strong className="text-neutral-900">{formatRupiah(total * 100)}</strong>
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={busy}>Batal</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan PO"}</Button>
            </div>
          </div>
        </Card>
      )}

      {initialPOs.length === 0 ? (
        <Card className="py-12 text-center">
          <Truck className="mx-auto size-8 text-neutral-400" aria-hidden />
          <p className="mt-3 text-sm text-neutral-600">Belum ada purchase order.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                <th className="px-4 py-3 text-left font-medium">Supplier</th>
                <th className="px-4 py-3 text-right font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="w-px px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {initialPOs.map((po) => {
                const meta = statusMeta[po.status];
                return (
                  <tr key={po.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-neutral-600">{formatDateID(po.created_at)}</td>
                    <td className="px-4 py-3 text-neutral-900">{po.supplier_name || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{po.item_count}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatRupiah(po.total_cents)}</td>
                    <td className="px-4 py-3"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                    <td className="px-4 py-3">
                      {(po.status === "draft" || po.status === "ordered") && (
                        <div className="flex items-center justify-end gap-1">
                          {po.status === "draft" && (
                            <button
                              onClick={() => act(po.id, "ordered")}
                              disabled={busy}
                              title="Tandai dipesan"
                              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                            >
                              <Send className="size-3.5" aria-hidden />
                              Dipesan
                            </button>
                          )}
                          <button
                            onClick={() => act(po.id, "receive")}
                            disabled={busy}
                            title="Terima & restock"
                            className="inline-flex items-center gap-1 rounded-md border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          >
                            <PackageCheck className="size-3.5" aria-hidden />
                            Terima
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
