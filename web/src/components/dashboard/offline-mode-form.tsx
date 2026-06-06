"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, Loader2, Save } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function OfflineModeForm({ initial }: { initial: Store | null }) {
  const { refresh } = useRouter();
  const [enabled, setEnabled] = useState(initial?.offline_enabled ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/offline`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offline_enabled: enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Gagal menyimpan");
        return;
      }
      showSuccess("Pengaturan mode offline tersimpan");
      refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">Mode Offline (Kasir)</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Biar kasir tetap bisa jualan walau internet putus. Saat aktif, katalog
          produk disimpan di perangkat kasir dan transaksi yang dibuat offline
          masuk antrian — otomatis tersinkron begitu internet kembali.
        </p>
      </div>

      <Card>
        <label className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <WifiOff className="size-5 text-brand-600" aria-hidden />
            <span>
              <span className="block font-semibold text-neutral-900">Aktifkan mode offline</span>
              <span className="block text-sm text-neutral-500">
                Pengaturan ini mengaktifkan kemampuan offline; tiap perangkat
                kasir menyimpan datanya sendiri.
              </span>
            </span>
          </span>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>
      </Card>

      <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-neutral-700">
        <strong className="text-neutral-900">Yang perlu diketahui:</strong>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Buka shift kasir saat masih online dulu — buka/tutup shift butuh internet.</li>
          <li>Transaksi offline dapat nomor sementara di struk; nomor final muncul setelah sync.</li>
          <li>Kalau stok berubah saat sync (mis. kejual online juga), pesanan tetap masuk tapi ditandai <em>perlu dicek</em> di daftar pesanan.</li>
        </ul>
      </div>

      <div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
