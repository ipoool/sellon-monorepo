"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Loader2, Save } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function TaxForm({ initial }: { initial: Store | null }) {
  const { refresh } = useRouter();
  const [enabled, setEnabled] = useState(initial?.tax_enabled ?? false);
  // Store keeps basis points; the form edits a human percent (1100 ⇄ "11").
  const [percent, setPercent] = useState(
    initial?.tax_bps ? String(initial.tax_bps / 100) : "11",
  );
  const [inclusive, setInclusive] = useState(initial?.tax_inclusive ?? false);
  const [label, setLabel] = useState(initial?.tax_label || "PPN");
  const [saving, setSaving] = useState(false);

  const pct = Math.max(0, Math.min(100, parseFloat(percent || "0") || 0));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/tax`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tax_enabled: enabled,
          tax_bps: Math.round(pct * 100),
          tax_inclusive: inclusive,
          tax_label: label.trim() || "PPN",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Gagal menyimpan");
        return;
      }
      showSuccess("Pengaturan pajak tersimpan");
      refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">Pajak / PPN</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Atur tarif pajak untuk pesanan toko. Pajak dihitung dari subtotal produk
          (setelah diskon) dan muncul di detail pesanan.
        </p>
      </div>

      <Card>
        <label className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <Receipt className="size-5 text-brand-600" aria-hidden />
            <span>
              <span className="block font-semibold text-neutral-900">Aktifkan pajak</span>
              <span className="block text-sm text-neutral-500">
                Hitung pajak otomatis untuk setiap pesanan baru.
              </span>
            </span>
          </span>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>
      </Card>

      {enabled && (
        <Card>
          <div className="grid gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Nama pajak</span>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="PPN" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Tarif (%)</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="11"
              />
              <span className="text-xs text-neutral-400">Contoh: 11 untuk PPN 11%.</span>
            </label>

            {/* Customer-borne vs included */}
            <div className="rounded-xl border border-neutral-200 p-3">
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium text-neutral-900">
                    Pajak ditanggung pembeli
                  </span>
                  <span className="block text-sm text-neutral-500">
                    {inclusive
                      ? "Nonaktif: pajak sudah termasuk di harga — total tidak berubah, pajak hanya ditampilkan sebagai rincian."
                      : "Aktif: pajak ditambahkan di atas subtotal — pembeli membayar lebih."}
                  </span>
                </span>
                {/* checked = customer-borne (NOT inclusive) */}
                <Switch checked={!inclusive} onChange={(e) => setInclusive(!e.target.checked)} />
              </label>
            </div>

            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Contoh subtotal Rp100.000 dengan {label || "PPN"} {pct}%:{" "}
              {inclusive
                ? `total tetap Rp100.000 (termasuk pajak ~Rp${Math.round((100000 * (pct * 100)) / (10000 + pct * 100)).toLocaleString("id-ID")}).`
                : `pajak +Rp${Math.round((100000 * pct) / 100).toLocaleString("id-ID")} → total Rp${(100000 + Math.round((100000 * pct) / 100)).toLocaleString("id-ID")}.`}
            </div>
          </div>
        </Card>
      )}

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
