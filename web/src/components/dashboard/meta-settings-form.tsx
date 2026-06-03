"use client";

import { useState, type FormEvent } from "react";
import { Megaphone, Loader2, Save, Copy, Check, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InfoPopover } from "@/components/ui/info-popover";
import { showError, showSuccess } from "@/lib/toast";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export type MetaConfig = {
  enabled: boolean;
  pixel_id: string;
  test_event_code: string;
  catalog_id: string;
  has_token: boolean;
  feed_url: string;
};

export function MetaSettingsForm({ initial }: { initial: MetaConfig | null }) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [pixelId, setPixelId] = useState(initial?.pixel_id ?? "");
  const [token, setToken] = useState(""); // write-only; never prefilled
  const [hasToken, setHasToken] = useState(initial?.has_token ?? false);
  const [testCode, setTestCode] = useState(initial?.test_event_code ?? "");
  const [catalogId, setCatalogId] = useState(initial?.catalog_id ?? "");
  const [feedUrl, setFeedUrl] = useState(initial?.feed_url ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyFeed = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showError("Gagal menyalin");
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (enabled && !pixelId.trim()) {
      showError("Pixel ID wajib diisi untuk mengaktifkan");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/meta`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          pixel_id: pixelId.trim(),
          access_token: token.trim(), // empty = keep existing
          test_event_code: testCode.trim(),
          catalog_id: catalogId.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<MetaConfig> & { error?: string };
      if (!res.ok) {
        showError(data.error || "Gagal menyimpan");
        return;
      }
      setHasToken(data.has_token ?? hasToken);
      if (data.feed_url) setFeedUrl(data.feed_url);
      setToken(""); // clear the write-only field after save
      showSuccess("Konfigurasi Meta tersimpan");
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">
          Integrasi Meta (Facebook &amp; Instagram)
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Hubungkan toko ke Facebook &amp; Instagram: produk otomatis masuk
          katalog Meta dan penjualan dari iklan ikut terlacak. Lihat produk
          mana yang laku dari iklan langsung di Meta Ads Manager.
        </p>
      </div>

      {/* Enable */}
      <Card>
        <label className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <Megaphone className="size-5 text-[#1877F2]" aria-hidden />
            <span>
              <span className="block font-semibold text-neutral-900">Aktifkan pelacakan Meta</span>
              <span className="block text-sm text-neutral-500">
                Pasang Meta Pixel di toko dan kirim data penjualan ke Meta.
              </span>
            </span>
          </span>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>
      </Card>

      {/* Pixel + CAPI credentials */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-neutral-900">Pixel &amp; Conversions API</h2>
          <InfoPopover label="Cara dapat Pixel ID & Token" title="Ambil dari Meta Events Manager" align="right">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Buka Meta Events Manager (business.facebook.com/events_manager).</li>
              <li>Pilih atau buat Dataset/Pixel toko kamu, lalu salin <strong>Pixel ID</strong>.</li>
              <li>Di pengaturan dataset → bagian <em>Conversions API</em> → klik <em>Generate access token</em>, lalu salin tokennya.</li>
              <li>Tempel Pixel ID &amp; Access Token di sini, lalu Simpan.</li>
            </ol>
            <p className="mt-2 text-xs text-neutral-400">
              Pixel ID melacak aktivitas pembeli; Access Token mengirim data
              penjualan langsung ke Meta agar lebih akurat.
            </p>
          </InfoPopover>
        </div>
        <div className="grid gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Pixel ID</span>
            <Input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="contoh: 1234567890123456"
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">
              Conversions API Access Token
            </span>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={hasToken ? "•••••••• (tersimpan — isi untuk mengganti)" : "Tempel token di sini"}
              autoComplete="off"
            />
            <span className="text-xs text-neutral-400">
              Token disimpan terenkripsi dan tidak pernah ditampilkan kembali.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">
              Test Event Code <span className="text-neutral-400">(opsional)</span>
            </span>
            <Input
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              placeholder="TEST12345 — untuk uji di Events Manager"
            />
          </label>
        </div>
      </Card>

      {/* Catalog feed */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-neutral-900">Katalog Produk</h2>
          <InfoPopover label="Cara hubungkan katalog" title="Hubungkan di Commerce Manager" align="right">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Buka Meta Commerce Manager → <em>Katalog</em> (buat baru jika belum ada).</li>
              <li>Masuk ke <em>Sumber Data</em> → <em>Tambah Item</em> → pilih <em>Gunakan URL feed terjadwal</em>.</li>
              <li>Tempel <strong>URL Feed</strong> di bawah, lalu atur jadwal (mis. harian).</li>
              <li>Hubungkan katalog ke Pixel/Dataset kamu agar penjualan ter-atribusi.</li>
            </ol>
            <p className="mt-2 text-xs text-neutral-400">Produk aktif otomatis tersinkron tiap Meta menarik feed.</p>
          </InfoPopover>
        </div>
        <div className="grid gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">URL Feed (read-only)</span>
            <div className="flex gap-2">
              <Input value={feedUrl} readOnly className="flex-1 font-mono text-xs" />
              <Button type="button" variant="outline" onClick={copyFeed} disabled={!feedUrl}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Tersalin" : "Salin"}
              </Button>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">
              Catalog ID <span className="text-neutral-400">(opsional, untuk catatan)</span>
            </span>
            <Input
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              placeholder="ID katalog dari Commerce Manager"
              inputMode="numeric"
            />
          </label>
          <a
            href="https://www.facebook.com/business/help/120325381656392"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <ExternalLink className="size-4" aria-hidden />
            Panduan menghubungkan katalog di Meta
          </a>
        </div>
      </Card>

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
