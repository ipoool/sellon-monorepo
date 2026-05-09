"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { JamBukaEditor } from "@/components/dashboard/jam-buka-editor";
import type { OpenHours, Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const categories = [
  "Makanan & Minuman",
  "Fashion",
  "Kecantikan",
  "Kerajinan Tangan",
  "Elektronik",
  "Rumah Tangga",
  "Buku & Stationery",
  "Hobi & Mainan",
  "Lainnya",
];

export function TokoForm({ initial }: { initial: Store | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isCreating = !initial;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    let openHours: OpenHours = {};
    try {
      const raw = String(fd.get("open_hours") ?? "");
      if (raw) openHours = JSON.parse(raw);
    } catch {
      // fall back to empty
    }
    const body = {
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      description: String(fd.get("description") ?? ""),
      logo_url: String(fd.get("logo_url") ?? ""),
      category: String(fd.get("category") ?? ""),
      city: String(fd.get("city") ?? ""),
      whatsapp_number: String(fd.get("whatsapp_number") ?? ""),
      instagram: String(fd.get("instagram") ?? ""),
      tiktok: String(fd.get("tiktok") ?? ""),
      open_hours: openHours,
      is_open: fd.get("is_open") === "on",
    };

    try {
      const res = await fetch(`${apiBase}/api/v1/store`, {
        method: isCreating ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {isCreating && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-neutral-800">
          <p className="font-medium text-brand-700">
            Selamat datang! Mari setup toko-mu dulu.
          </p>
          <p className="mt-1 text-neutral-700">
            Pilih nama toko dan URL singkat (slug) — sisanya bisa diisi kapan saja.
          </p>
        </div>
      )}

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Informasi Dasar</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Yang akan dilihat pembeli di halaman katalog kamu.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">Nama Toko *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={initial?.name ?? ""}
              placeholder="Warung Bu Sari"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">URL Toko *</Label>
            <div className="flex items-stretch">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500">
                sellon.id/
              </span>
              <Input
                id="slug"
                name="slug"
                required
                disabled={!isCreating}
                defaultValue={initial?.slug ?? ""}
                placeholder="warung-bu-sari"
                className="rounded-l-none"
              />
            </div>
            {!isCreating && (
              <p className="text-xs text-neutral-500">URL toko tidak bisa diubah setelah dibuat.</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Kategori Usaha</Label>
            <Select
              id="category"
              name="category"
              defaultValue={initial?.category ?? ""}
            >
              <option value="">— Pilih kategori —</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Deskripsi Toko</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={initial?.description ?? ""}
              placeholder="Ceritakan singkat tentang toko-mu — produk apa, lokasi, kapan buka, kenapa pelanggan harus pilih kamu."
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="logo_url">URL Logo</Label>
            <Input
              id="logo_url"
              name="logo_url"
              type="url"
              defaultValue={initial?.logo_url ?? ""}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-neutral-500">
              Tempel link gambar (PNG/JPG, kotak ~512×512). Upload langsung akan
              hadir saat integrasi storage selesai.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Kontak & Lokasi</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Bantu pembeli mengenal toko-mu.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="whatsapp_number">Nomor WhatsApp</Label>
            <Input
              id="whatsapp_number"
              name="whatsapp_number"
              type="tel"
              defaultValue={initial?.whatsapp_number ?? ""}
              placeholder="62812-3456-7890"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">Kota</Label>
            <Input
              id="city"
              name="city"
              defaultValue={initial?.city ?? ""}
              placeholder="Yogyakarta"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              name="instagram"
              defaultValue={initial?.instagram ?? ""}
              placeholder="@warung_bu_sari"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tiktok">TikTok</Label>
            <Input
              id="tiktok"
              name="tiktok"
              defaultValue={initial?.tiktok ?? ""}
              placeholder="@warungbusari"
            />
          </div>
        </div>
      </Card>

      {!isCreating && (
        <>
          <Card>
            <div className="mb-4">
              <h2 className="font-semibold text-neutral-900">Jam Buka</h2>
              <p className="mt-0.5 text-sm text-neutral-500">
                Atur jam operasional per hari. Tampil di halaman toko.
              </p>
            </div>
            <JamBukaEditor
              name="open_hours"
              initial={initial?.open_hours ?? {}}
            />
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-neutral-900">Status Toko</h2>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Saat dimatikan, halaman publik tampil &ldquo;sedang tutup&rdquo; dan tidak
                  bisa terima order baru. Override jam buka di atas.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <Switch
                  name="is_open"
                  defaultChecked={initial?.is_open ?? true}
                />
                <Badge variant="success">Toko buka</Badge>
              </label>
            </div>
          </Card>
        </>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          {success && (
            <span className="font-medium text-success">✓ Tersimpan</span>
          )}
          {error && <span className="font-medium text-danger">{error}</span>}
        </div>
        <div className="flex items-center gap-2">
          {!isCreating && initial && (
            <a
              href={`https://sellon.id/${initial.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button type="button" variant="outline" size="md">
                <ExternalLink className="size-4" aria-hidden />
                Lihat Halaman Toko
              </Button>
            </a>
          )}
          <Button type="submit" size="md" disabled={pending}>
            <Save className="size-4" aria-hidden />
            {pending ? "Menyimpan…" : isCreating ? "Buat Toko" : "Simpan Perubahan"}
          </Button>
        </div>
      </div>
    </form>
  );
}
