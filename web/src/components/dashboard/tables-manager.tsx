"use client";

import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Plus, Trash2, Save, Printer, Utensils, Palette, Monitor, Copy, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { QrCard, type QrCardConfig, type QrLayout } from "@/components/dashboard/qr-card";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { RestaurantTable, DineInSettings } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Deterministic public origin shared by SSR + client so the QR matrix is
// identical on both sides (avoids a hydration mismatch). Mirrors middleware.ts.
const PUBLIC_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100"
).replace(/\/$/, "");

function tableURL(token: string) {
  return `${PUBLIC_ORIGIN}/t/${token}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LAYOUTS: { id: QrLayout; label: string; desc: string }[] = [
  { id: "classic", label: "Klasik", desc: "Kartu putih simpel" },
  { id: "tent", label: "Tent (Meja)", desc: "Mendatar, QR + teks besar" },
  { id: "poster", label: "Poster", desc: "Tegak, QR besar di tengah" },
];

// Color picker row: native swatch + a synced hex text input.
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-200 bg-white p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 font-mono uppercase"
          maxLength={9}
        />
      </div>
    </label>
  );
}

export function TablesManager({
  initialTables,
  initialSettings,
  storeName = "",
  storeSlug = "",
}: {
  initialTables: RestaurantTable[];
  initialSettings: DineInSettings;
  storeName?: string;
  storeSlug?: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [paymentMode, setPaymentMode] = useState<DineInSettings["payment_mode"]>(initialSettings.payment_mode);
  const [kdsEnabled, setKdsEnabled] = useState(initialSettings.kds_enabled);
  const [qrLayout, setQrLayout] = useState<QrLayout>(
    (initialSettings.qr_layout as QrLayout) || "classic",
  );
  const [qrFg, setQrFg] = useState(initialSettings.qr_fg_color || "#FFFFFF");
  const [qrBg, setQrBg] = useState(initialSettings.qr_bg_color || "#1E3A8A");
  const [qrHeadline, setQrHeadline] = useState(initialSettings.qr_headline ?? "");
  const [qrCaption, setQrCaption] = useState(
    initialSettings.qr_caption ?? "Scan untuk pesan",
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newArea, setNewArea] = useState("");
  const [busy, setBusy] = useState(false);

  const qrConfig: QrCardConfig = {
    layout: qrLayout,
    bg: qrBg,
    fg: qrFg,
    headline: qrHeadline,
    caption: qrCaption,
    storeName,
  };

  const queueURL = storeSlug ? `${PUBLIC_ORIGIN}/q/${storeSlug}` : "";
  const copyQueueURL = () => {
    if (!queueURL || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(queueURL)
      .then(() => showSuccess("Link layar antrian disalin"))
      .catch(() => showError("Gagal menyalin"));
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/dinein`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          payment_mode: paymentMode,
          kds_enabled: kdsEnabled,
          qr_layout: qrLayout,
          qr_fg_color: qrFg,
          qr_bg_color: qrBg,
          qr_headline: qrHeadline.trim(),
          qr_caption: qrCaption.trim(),
        }),
      });
      if (res.status === 402) {
        showError("Fitur dine-in hanya untuk paket Bisnis");
        return;
      }
      if (!res.ok) {
        showError("Gagal menyimpan");
        return;
      }
      showSuccess("Pengaturan disimpan");
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
        showError("Fitur dine-in hanya untuk paket Bisnis");
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

  // Print the selected template by serializing the SAME QrCard component used
  // for the live preview — inline styles travel with it into the print window.
  const printQR = (label: string, token: string) => {
    const cardHTML = renderToStaticMarkup(
      <QrCard config={qrConfig} url={tableURL(token)} label={label} />,
    );
    const win = window.open("", "_blank", "width=560,height=640");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>QR Meja ${escapeHtml(label)}</title>
      <style>
        @page { margin: 16mm; }
        /* Force browsers to actually print background colors/images — without
           this the themed card background is dropped on print. */
        *{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;font-family:system-ui,-apple-system,sans-serif}
      </style></head>
      <body>${cardHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.onload = () => win.print();
    setTimeout(() => {
      try {
        win.print();
      } catch {
        /* window may already be closed */
      }
    }, 300);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Dine-in settings */}
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
          <div className="mt-4 grid items-start gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Pembayaran</span>
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as DineInSettings["payment_mode"])}>
                <option value="cashier">Bayar di kasir (pesan dulu)</option>
                <option value="online">Bayar online dulu (Midtrans/QRIS)</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Kitchen Display (KDS)</span>
              <div className="flex h-10 items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3">
                <span className="text-sm text-neutral-600">Tampilkan pesanan di layar dapur</span>
                <Switch checked={kdsEnabled} onChange={(e) => setKdsEnabled(e.target.checked)} />
              </div>
            </label>
          </div>
        )}

        {/* Public queue board link — for a TV/tablet near the counter. Only
            meaningful when KDS is on (that's what populates queue numbers). */}
        {enabled && kdsEnabled && queueURL && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-center gap-2">
              <Monitor className="size-4 text-brand-600" aria-hidden />
              <p className="text-sm font-medium text-neutral-900">Layar Antrian Pelanggan</p>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Buka di TV/tablet dekat kasir — pelanggan melihat nomor antrian
              yang sedang disiapkan & siap diambil.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-xs text-neutral-700">
                {queueURL}
              </code>
              <Button size="sm" variant="outline" onClick={copyQueueURL}>
                <Copy className="size-4" aria-hidden />
                Salin
              </Button>
              <a href={queueURL} target="_blank" rel="noopener noreferrer">
                <Button size="sm">
                  <ExternalLink className="size-4" aria-hidden />
                  Buka Layar
                </Button>
              </a>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
            <Save className="size-4" aria-hidden />
            {savingSettings ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
        </div>
      </Card>

      {/* Custom QR card layout */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Palette className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Layout Kartu QR</h2>
        </div>
        <p className="mb-4 text-sm text-neutral-500">
          Pilih desain kartu QR meja, atur warna & teks. Berlaku untuk hasil
          cetak. QR sendiri tetap hitam-putih agar mudah di-scan.
        </p>

        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          {/* Controls */}
          <div className="flex flex-col gap-4">
            {/* Template chooser */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-600">Template</span>
              <div className="grid grid-cols-3 gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setQrLayout(l.id)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left transition-colors",
                      qrLayout === l.id
                        ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                        : "border-neutral-200 hover:border-neutral-300",
                    )}
                  >
                    <span className="block text-sm font-semibold text-neutral-900">{l.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">{l.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {qrLayout !== "classic" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorRow label="Warna kartu" value={qrBg} onChange={setQrBg} />
                <ColorRow label="Warna teks" value={qrFg} onChange={setQrFg} />
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Headline</span>
              <Input
                value={qrHeadline}
                onChange={(e) => setQrHeadline(e.target.value)}
                placeholder="Scan di Sini"
                maxLength={60}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Teks tambahan (boleh beberapa baris)</span>
              <textarea
                value={qrCaption}
                onChange={(e) => setQrCaption(e.target.value)}
                placeholder={"Lihat Menu\nPesan Langsung"}
                maxLength={120}
                rows={2}
                className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
                <Save className="size-4" aria-hidden />
                {savingSettings ? "Menyimpan..." : "Simpan Layout"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setQrLayout("classic");
                  setQrFg("#FFFFFF");
                  setQrBg("#1E3A8A");
                  setQrHeadline("");
                  setQrCaption("Scan untuk pesan");
                }}
                className="text-sm text-neutral-500 hover:text-neutral-700"
              >
                Reset default
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="self-start text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Pratinjau
            </p>
            <div className="overflow-auto">
              <QrCard config={qrConfig} url={tableURL("preview")} label="1" />
            </div>
          </div>
        </div>
      </Card>

      {/* Tables list */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <QrCode className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Daftar Meja</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nomor/nama meja (mis. 12)" className="w-44" />
          <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Area (opsional)" className="w-40" />
          <Button onClick={addTable} disabled={busy}>
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
                <div className="rounded-lg border border-neutral-200 bg-white p-2">
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
