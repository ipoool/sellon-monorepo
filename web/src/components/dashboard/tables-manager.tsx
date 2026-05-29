"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Plus, Trash2, Save, Printer, Utensils } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import type { RestaurantTable, DineInSettings } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function tableURL(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/t/${token}`;
}

export function TablesManager({
  initialTables,
  initialSettings,
}: {
  initialTables: RestaurantTable[];
  initialSettings: DineInSettings;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [paymentMode, setPaymentMode] = useState<DineInSettings["payment_mode"]>(initialSettings.payment_mode);
  const [kdsEnabled, setKdsEnabled] = useState(initialSettings.kds_enabled);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newArea, setNewArea] = useState("");
  const [busy, setBusy] = useState(false);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/dinein`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, payment_mode: paymentMode, kds_enabled: kdsEnabled }),
      });
      if (res.status === 402) {
        showError("Fitur dine-in hanya untuk plan Pro/Bisnis");
        return;
      }
      if (!res.ok) {
        showError("Gagal menyimpan");
        return;
      }
      showSuccess("Pengaturan dine-in disimpan");
      router.refresh();
    } finally {
      setSavingSettings(false);
    }
  };

  const addTable = async () => {
    if (!newLabel.trim()) {
      showError("Nama/nomor meja wajib");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/tables`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), area: newArea.trim() }),
      });
      if (res.status === 402) {
        showError("Fitur dine-in hanya untuk plan Pro/Bisnis");
        return;
      }
      if (!res.ok) {
        showError("Gagal menambah meja (nama mungkin duplikat)");
        return;
      }
      setNewLabel("");
      setNewArea("");
      showSuccess("Meja ditambahkan");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const delTable = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`${apiBase}/api/v1/tables/${id}`, { method: "DELETE", credentials: "include" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const printQR = (label: string, token: string) => {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    // Minimal printable QR sheet.
    win.document.write(`<html><head><title>QR Meja ${label}</title></head><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><h2>Meja ${label}</h2><div id="q"></div><p style="color:#666">Scan untuk pesan</p></body></html>`);
    win.document.close();
    // Render a simple QR via an <img> from a data URL is complex; instead show the URL big.
    const el = win.document.getElementById("q");
    if (el) el.innerHTML = `<p style="font-family:monospace;font-size:13px;word-break:break-all;max-width:320px">${tableURL(token)}</p>`;
    win.focus();
    win.print();
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Utensils className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900">Pesan via QR Meja (Dine-In)</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Pelanggan scan QR di meja, pilih dine-in/take away, dan pesan sendiri dari HP.
                Pesanan masuk ke dapur (KDS) + antrian.
              </p>
            </div>
          </div>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </div>

        {enabled && (
          <div className="mt-4 grid gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Pembayaran</span>
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as DineInSettings["payment_mode"])}>
                <option value="cashier">Bayar di kasir (pesan dulu)</option>
                <option value="online">Bayar online dulu (Midtrans/QRIS)</option>
              </Select>
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-neutral-900">Kitchen Display (KDS)</p>
                <p className="text-xs text-neutral-600">Tampilkan pesanan di layar dapur</p>
              </div>
              <Switch checked={kdsEnabled} onChange={(e) => setKdsEnabled(e.target.checked)} />
            </label>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
            <Save className="size-4" aria-hidden />
            {savingSettings ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <QrCode className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Daftar Meja</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nomor/nama meja (mis. 12)" className="w-44" />
          <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Area (opsional)" className="w-40" />
          <Button size="sm" onClick={addTable} disabled={busy}>
            <Plus className="size-4" aria-hidden />
            Tambah Meja
          </Button>
        </div>

        {initialTables.length === 0 ? (
          <p className="mt-6 text-center text-sm text-neutral-500">Belum ada meja.</p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initialTables.map((t) => (
              <div key={t.id} className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 p-4">
                <div className="flex w-full items-center justify-between">
                  <div>
                    <p className="font-semibold text-neutral-900">Meja {t.label}</p>
                    {t.area && <p className="text-xs text-neutral-500">{t.area}</p>}
                  </div>
                  <button
                    onClick={() => delTable(t.id)}
                    className="flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                    aria-label="Hapus meja"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <QRCodeSVG value={tableURL(t.qr_token)} size={120} />
                </div>
                <Button size="sm" variant="outline" onClick={() => printQR(t.label, t.qr_token)} className="w-full">
                  <Printer className="size-4" aria-hidden />
                  Cetak
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
