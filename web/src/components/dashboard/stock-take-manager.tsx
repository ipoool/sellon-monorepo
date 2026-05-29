"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateID } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import type { StockTake, StockTakeItem } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type SheetItem = StockTakeItem & { counted: string };

export function StockTakeManager({ initial }: { initial: StockTake[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Active count sheet (after starting a new opname).
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [items, setItems] = useState<SheetItem[]>([]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/stock-takes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "" }),
      });
      if (res.status === 402) {
        showError("Fitur stok opname hanya untuk plan Pro/Bisnis");
        return;
      }
      if (!res.ok) {
        showError("Gagal memulai opname");
        return;
      }
      const { id } = await res.json();
      const detail = await fetch(`${apiBase}/api/v1/stock-takes/${id}`, { credentials: "include" });
      const data = await detail.json();
      setSheetId(id);
      setItems(
        (data.items as StockTakeItem[]).map((it) => ({ ...it, counted: String(it.system_qty) })),
      );
    } catch {
      showError("Gagal memulai opname");
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!sheetId) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/stock-takes/${sheetId}/post`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counts: items.map((it) => ({
            item_id: it.id,
            counted_qty: parseInt(it.counted, 10) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal posting opname");
        return;
      }
      showSuccess("Opname diposting — stok disesuaikan");
      setSheetId(null);
      setItems([]);
      router.refresh();
    } catch {
      showError("Gagal posting opname");
    } finally {
      setBusy(false);
    }
  };

  if (sheetId) {
    const adjustedCount = items.filter(
      (it) => (parseInt(it.counted, 10) || 0) !== it.system_qty,
    ).length;
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-neutral-900">Hitung Stok Fisik</h2>
            <p className="text-sm text-neutral-500">
              Isi jumlah hasil hitung fisik. {adjustedCount} bahan akan disesuaikan.
            </p>
          </div>
          <button
            onClick={() => {
              setSheetId(null);
              setItems([]);
            }}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
            aria-label="Batal"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-neutral-500">
              <tr>
                <th className="py-2 text-left font-medium">Bahan</th>
                <th className="py-2 text-right font-medium">Sistem</th>
                <th className="py-2 text-right font-medium">Hitung Fisik</th>
                <th className="py-2 text-right font-medium">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((it, i) => {
                const counted = parseInt(it.counted, 10) || 0;
                const diff = counted - it.system_qty;
                return (
                  <tr key={it.id}>
                    <td className="py-2 font-medium text-neutral-900">{it.material_name}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-500">
                      {it.system_qty} {it.base_unit}
                    </td>
                    <td className="py-2 text-right">
                      <Input
                        type="number"
                        value={it.counted}
                        onChange={(e) =>
                          setItems((xs) => xs.map((x, j) => (j === i ? { ...x, counted: e.target.value } : x)))
                        }
                        className="ml-auto w-24 text-right"
                      />
                    </td>
                    <td
                      className={
                        "py-2 text-right tabular-nums " +
                        (diff === 0 ? "text-neutral-400" : diff > 0 ? "text-success" : "text-danger")
                      }
                    >
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSheetId(null);
              setItems([]);
            }}
            disabled={busy}
          >
            Batal
          </Button>
          <Button onClick={post} disabled={busy}>
            {busy ? "Memproses..." : "Posting Opname"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">{initial.length} riwayat opname</p>
        <Button size="sm" onClick={start} disabled={busy}>
          <Plus className="size-4" aria-hidden />
          Mulai Opname
        </Button>
      </div>

      {initial.length === 0 ? (
        <Card className="py-12 text-center">
          <ClipboardCheck className="mx-auto size-8 text-neutral-400" aria-hidden />
          <p className="mt-3 text-sm text-neutral-600">Belum ada riwayat opname.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                <th className="px-4 py-3 text-right font-medium">Bahan</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {initial.map((st) => (
                <tr key={st.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-600">{formatDateID(st.created_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{st.item_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <Badge variant={st.status === "posted" ? "success" : "default"}>
                      {st.status === "posted" ? "Diposting" : "Draft"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
