"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, Palette, Eye, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploadInput } from "@/components/dashboard/image-upload-input";
import { cn } from "@/lib/utils";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Pre-cooked OKLCH hue presets so sellers can pick a color palette without
// touching numbers. The hue maps directly into the public toko page's
// brand-* CSS variables.
const themePresets: { hue: number; label: string; swatch: string }[] = [
  { hue: 145, label: "Hijau", swatch: "oklch(0.71 0.18 145)" },
  { hue: 35, label: "Oranye", swatch: "oklch(0.70 0.20 35)" },
  { hue: 25, label: "Merah", swatch: "oklch(0.62 0.21 25)" },
  { hue: 75, label: "Amber", swatch: "oklch(0.78 0.15 75)" },
  { hue: 200, label: "Cyan", swatch: "oklch(0.70 0.13 200)" },
  { hue: 250, label: "Biru", swatch: "oklch(0.62 0.18 250)" },
  { hue: 280, label: "Ungu", swatch: "oklch(0.62 0.18 280)" },
  { hue: 320, label: "Pink", swatch: "oklch(0.70 0.18 320)" },
];

export function StorefrontForm({ initial }: { initial: Store }) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(initial.banner_url ?? "");
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [themeHue, setThemeHue] = useState<number>(initial.theme_hue ?? 145);
  const [showHours, setShowHours] = useState(initial.show_hours_public ?? true);
  const [showSocial, setShowSocial] = useState(
    initial.show_social_public ?? true,
  );
  const [footerText, setFooterText] = useState(initial.footer_text ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/storefront`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logo_url: logoUrl,
          banner_url: bannerUrl,
          tagline: tagline.trim(),
          theme_hue: themeHue,
          show_hours_public: showHours,
          show_social_public: showSocial,
          footer_text: footerText.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setPending(false);
    }
  }

  // Live preview accent for the theme swatch — same OKLCH at lightness 500.
  const previewSwatch = `oklch(0.71 0.18 ${themeHue})`;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-900">Tampilan Toko</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Logo, banner, dan tagline yang muncul di halaman publik tokomu.
            </p>
          </div>
          <a
            href={`/${initial.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <Eye className="size-4" aria-hidden />
            Lihat halaman toko
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Logo Toko</Label>
            <ImageUploadInput
              value={logoUrl}
              onChange={setLogoUrl}
              kind="logo"
              shape="square"
            />
            <p className="text-xs text-neutral-500">
              PNG/JPG kotak (~512×512). Tampil sebagai avatar toko.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={120}
              placeholder="Mis: Kopi Sangrai Lokal Terbaik di Jogja"
            />
            <p className="text-xs text-neutral-500">
              Satu kalimat catchy. Muncul di banner halaman toko.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Banner Toko</Label>
            <ImageUploadInput
              value={bannerUrl}
              onChange={setBannerUrl}
              kind="banner"
              shape="wide"
            />
            <p className="text-xs text-neutral-500">
              Gambar landscape (~1600×500). Kosongkan jika tidak pakai.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Palette className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Warna Tema</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Warna ini dipakai untuk tombol, badge, dan aksen di halaman
              publik toko.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {themePresets.map((p) => {
            const active = themeHue === p.hue;
            return (
              <button
                key={p.hue}
                type="button"
                onClick={() => setThemeHue(p.hue)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors",
                  active
                    ? "border-neutral-900 bg-neutral-50 text-neutral-900 ring-2 ring-neutral-900/10"
                    : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
                )}
                title={p.label}
                aria-label={`Pilih tema ${p.label}`}
                aria-pressed={active}
              >
                <span
                  className="size-8 rounded-full ring-1 ring-neutral-200"
                  style={{ backgroundColor: p.swatch }}
                />
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <span
            className="size-6 shrink-0 rounded-full ring-1 ring-neutral-200"
            style={{ backgroundColor: previewSwatch }}
            aria-hidden
          />
          <div className="flex-1">
            <p className="font-medium text-neutral-900">Preview warna utama</p>
            <p className="text-xs text-neutral-600">
              Hue OKLCH: {themeHue} — sama dipakai untuk seluruh skala
              brand-50 sampai brand-950.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Visibilitas</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Atur bagian mana saja yang ditampilkan di halaman publik tokomu.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-neutral-900">
                Tampilkan jam buka
              </p>
              <p className="text-xs text-neutral-600">
                Header halaman toko menampilkan status buka/tutup + jam
                operasional hari ini.
              </p>
            </div>
            <Switch
              checked={showHours}
              onChange={(e) => setShowHours(e.target.checked)}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-neutral-900">
                Tampilkan kontak sosial
              </p>
              <p className="text-xs text-neutral-600">
                Link ke Instagram & TikTok di header halaman toko (jika diisi
                di Profil Toko).
              </p>
            </div>
            <Switch
              checked={showSocial}
              onChange={(e) => setShowSocial(e.target.checked)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="footer_text">Teks footer (opsional)</Label>
          <Input
            id="footer_text"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            maxLength={200}
            placeholder="Mis: Terima kasih sudah belanja di toko kami!"
          />
          <p className="text-xs text-neutral-500">
            Muncul di footer halaman toko, di atas branding SellOn.
          </p>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          {saved && <span className="font-medium text-success">✓ Tersimpan</span>}
          {error && <span className="font-medium text-danger">{error}</span>}
        </span>
        <Button type="submit" disabled={pending}>
          <Save className="size-4" aria-hidden />
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
