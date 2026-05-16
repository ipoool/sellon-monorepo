"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { deleteUploaded } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Save,
  Palette,
  Eye,
  ExternalLink,
  Lock,
  Crown,
  LayoutGrid,
  List as ListIcon,
  Star,
  LayoutDashboard,
  LayoutPanelTop,
  Rows3,
  MonitorSmartphone,
  BookOpen,
  RectangleVertical,
  Settings2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ImageUploadInput } from "@/components/dashboard/image-upload-input";
import { LayoutPreviewDialog } from "@/components/dashboard/layout-preview-dialog";
import { usePlan } from "@/components/dashboard/plan-context";
import { cn } from "@/lib/utils";
import type { Store, LayoutConfig } from "@/lib/types";

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
  const { refresh } = useRouter();
  const plan = usePlan();
  const themeLocked = plan !== "pro" && plan !== "bisnis";
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(initial.banner_url ?? "");
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [themeHue, setThemeHue] = useState<number>(initial.theme_hue ?? 145);
  const [productLayout, setProductLayout] = useState<LayoutKey>(
    initial.product_layout ?? "grid",
  );
  // Buka preview dialog dari card layout. Null = closed; string = layout
  // yang sedang di-preview (boleh beda dari yang ter-save).
  const [previewLayout, setPreviewLayout] = useState<LayoutKey | null>(null);
  const [showHours, setShowHours] = useState(initial.show_hours_public ?? true);
  const [showSocial, setShowSocial] = useState(
    initial.show_social_public ?? true,
  );
  const [footerText, setFooterText] = useState(initial.footer_text ?? "");
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(
    initial.layout_config ?? {},
  );
  const [pending, setPending] = useState(false);
  const [kioskConfigOpen, setKioskConfigOpen] = useState(false);
  // Refs tracking URL gambar yang sudah benar-benar ter-save di server.
  // Pakai untuk hapus file lama di Supabase Storage saat seller ganti
  // logo / banner. Tidak pakai initial.{logo,banner}_url langsung karena
  // setelah save pertama, "URL lama" jadi yang baru di-save, bukan yang
  // di-mount-saat-load.
  const savedLogoRef = useRef<string>(initial.logo_url ?? "");
  const savedBannerRef = useRef<string>(initial.banner_url ?? "");
  const savedSlidesRef = useRef<string[]>(
    (initial.layout_config?.kiosk?.banner_slides ?? []).map((s) => s.image_url),
  );

  // Single source of truth untuk PUT storefront. onSubmit + onApply
  // layout sama-sama panggil ini, beda hanya nilai product_layout
  // yang dikirim.
  async function persistStorefront(layoutOverride?: LayoutKey) {
    const effectiveLayout = layoutOverride ?? productLayout;
    const res = await fetch(`${apiBase}/api/v1/store/storefront`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logo_url: logoUrl,
        banner_url: bannerUrl,
        tagline: tagline.trim(),
        theme_hue: themeHue,
        product_layout: effectiveLayout,
        show_hours_public: showHours,
        show_social_public: showSocial,
        footer_text: footerText.trim(),
        layout_config: layoutConfig,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    // Setelah PUT sukses, bersihkan file lama di Supabase Storage agar
    // tidak orphan. Fire-and-forget — backend punya cross-tenant guard
    // dan akan abaikan URL non-Supabase. Ref di-update agar save
    // berikutnya pakai baseline yang benar.
    if (savedLogoRef.current && savedLogoRef.current !== logoUrl) {
      void deleteUploaded(savedLogoRef.current);
    }
    if (savedBannerRef.current && savedBannerRef.current !== bannerUrl) {
      void deleteUploaded(savedBannerRef.current);
    }
    savedLogoRef.current = logoUrl;
    savedBannerRef.current = bannerUrl;

    const currentSlides =
      layoutConfig.kiosk?.banner_slides?.map((s) => s.image_url) ?? [];
    for (const oldUrl of savedSlidesRef.current) {
      if (oldUrl && !currentSlides.includes(oldUrl)) {
        void deleteUploaded(oldUrl);
      }
    }
    savedSlidesRef.current = currentSlides;
    return data;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await persistStorefront();
      showSuccess("Tersimpan");
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  // onApply dari LayoutPreviewDialog: langsung persist + refresh, jadi
  // storefront publik update tanpa user harus klik "Simpan" lagi.
  // Field lain di form yang masih dirty (tagline, banner, dll) ikut
  // di-snapshot sesuai state form saat ini — sama seperti tombol
  // Simpan biasa.
  async function applyLayout(picked: LayoutKey) {
    setProductLayout(picked);
    setPreviewLayout(null);
    setPending(true);
    try {
      await persistStorefront(picked);
      showSuccess(`Layout "${layoutLabels[picked]}" diterapkan ke storefront.`);
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  // Live preview accent for the theme swatch - same OKLCH at lightness 500.
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
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <Eye className="size-4" aria-hidden />
            <span className="hidden sm:inline">Lihat halaman toko</span>
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

      <Card className={cn(themeLocked && "border-warning/40 bg-warning/5")}>
        <div className="mb-4 flex items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              themeLocked
                ? "bg-warning/15 text-warning"
                : "bg-brand-50 text-brand-600",
            )}
          >
            {themeLocked ? (
              <Lock className="size-5" aria-hidden />
            ) : (
              <Palette className="size-5" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-neutral-900">Warna Tema</h2>
              {themeLocked && (
                <Badge variant="warning" className="gap-1">
                  <Crown className="size-3" aria-hidden />
                  Pro & Bisnis
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-neutral-500">
              {themeLocked
                ? "Custom warna brand untuk halaman publik toko. Upgrade ke Pro untuk pilih dari 8 preset warna."
                : "Warna ini dipakai untuk tombol, badge, dan aksen di halaman publik toko."}
            </p>
          </div>
          {themeLocked && (
            <Link href="/settings/subscription" className="shrink-0">
              <Button size="sm">
                <Crown className="size-3.5" aria-hidden />
                Upgrade
              </Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {themePresets.map((p) => {
            const active = themeHue === p.hue;
            return (
              <button
                key={p.hue}
                type="button"
                onClick={() => setThemeHue(p.hue)}
                disabled={themeLocked}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-neutral-900 bg-neutral-50 text-neutral-900 ring-2 ring-neutral-900/10"
                    : "border-neutral-200 text-neutral-600 hover:border-neutral-300 disabled:hover:border-neutral-200",
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
              Hue OKLCH: {themeHue} - sama dipakai untuk seluruh skala
              brand-50 sampai brand-950.
            </p>
          </div>
        </div>
      </Card>

      <ProductLayoutCard
        locked={themeLocked}
        value={productLayout}
        onChange={applyLayout}
        onPreview={setPreviewLayout}
        onConfigClick={() => setKioskConfigOpen(true)}
      />

      <KioskConfigDialog
        open={kioskConfigOpen}
        onClose={() => setKioskConfigOpen(false)}
        config={layoutConfig.kiosk ?? { banner_enabled: false, banner_slides: [] }}
        onChange={(kiosk) => setLayoutConfig((prev) => ({ ...prev, kiosk }))}
      />

      {previewLayout && (
        <LayoutPreviewDialog
          storeSlug={initial.slug}
          initialLayout={previewLayout}
          currentLayout={productLayout}
          onClose={() => setPreviewLayout(null)}
          onApply={applyLayout}
        />
      )}

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Visibilitas</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Atur bagian mana saja yang ditampilkan di halaman publik tokomu.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label
            htmlFor="show_hours_toggle"
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3"
          >
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
              id="show_hours_toggle"
              checked={showHours}
              onChange={(e) => setShowHours(e.target.checked)}
            />
          </label>
          <label
            htmlFor="show_social_toggle"
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3"
          >
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
              id="show_social_toggle"
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

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          <Save className="size-4" aria-hidden />
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ProductLayoutCard — picker untuk 3 layout produk di storefront.
// Free tier: locked dengan upgrade CTA; Pro/Bisnis: clickable.
// ─────────────────────────────────────────────────────────────────────

type LayoutKey =
  | "grid"
  | "list"
  | "showcase"
  | "compact"
  | "magazine"
  | "feed"
  | "kiosk"
  | "katalog"
  | "poster";

// Label bahasa Indonesia untuk tiap layout — dipakai di toast dan
// tempat lain yang menampilkan nama layout ke seller. Harus tetap
// sinkron dengan LAYOUTS di layout-preview-dialog.tsx.
const layoutLabels: Record<LayoutKey, string> = {
  grid: "Grid",
  list: "Daftar",
  showcase: "Sorotan",
  compact: "Padat",
  magazine: "Majalah",
  feed: "Feed",
  kiosk: "Kiosk",
  katalog: "Katalog",
  poster: "Poster",
};

const LAYOUTS: Array<{
  key: LayoutKey;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
}> = [
  {
    key: "grid",
    label: "Grid",
    description: "Card sama besar, multi-kolom. Cocok untuk katalog umum.",
    icon: LayoutGrid,
  },
  {
    key: "list",
    label: "Daftar",
    description:
      "Satu kolom dengan thumbnail kecil + info di samping. Cocok untuk produk dengan deskripsi panjang.",
    icon: ListIcon,
  },
  {
    key: "showcase",
    label: "Sorotan",
    description:
      "Produk pertama tampil besar, sisanya grid 2 kolom. Cocok untuk brand fashion / hero product.",
    icon: Star,
  },
  {
    key: "compact",
    label: "Padat",
    description:
      "Grid sangat dense, thumbnail kecil. Cocok untuk warung/sembako dengan banyak SKU mirip.",
    icon: LayoutDashboard,
  },
  {
    key: "magazine",
    label: "Majalah",
    description:
      "Layout asymmetric editorial — produk pertama besar di kiri, dua kecil di kanan. Cocok untuk brand bergaya.",
    icon: LayoutPanelTop,
  },
  {
    key: "feed",
    label: "Feed",
    description:
      "Satu kolom Instagram-style, foto square besar per produk. Cocok untuk fashion, makanan, atau produk fotogenik.",
    icon: Rows3,
  },
  {
    key: "kiosk",
    label: "Kiosk",
    description:
      "2 kolom besar touch-friendly, harga dominan. Cocok untuk kasir, menu kafe, atau display POS.",
    icon: MonitorSmartphone,
  },
  {
    key: "katalog",
    label: "Katalog",
    description:
      "Card horizontal dengan foto + deskripsi singkat. Cocok untuk produk yang butuh konteks lebih.",
    icon: BookOpen,
  },
  {
    key: "poster",
    label: "Poster",
    description:
      "Foto portrait besar full-width dengan teks overlay. Cocok untuk fashion, lifestyle, atau produk premium.",
    icon: RectangleVertical,
  },
];

function ProductLayoutCard({
  locked,
  value,
  onChange,
  onPreview,
  onConfigClick,
}: {
  locked: boolean;
  value: LayoutKey;
  onChange: (key: LayoutKey) => void;
  onPreview: (key: LayoutKey) => void;
  onConfigClick?: () => void;
}) {
  return (
    <Card className={cn(locked && "border-warning/40 bg-warning/5")}>
      <div className="mb-4 flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            locked
              ? "bg-warning/15 text-warning"
              : "bg-brand-50 text-brand-600",
          )}
        >
          {locked ? (
            <Lock className="size-5" aria-hidden />
          ) : (
            <LayoutGrid className="size-5" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-neutral-900">Layout Produk</h2>
            {locked && (
              <Badge variant="warning" className="gap-1">
                <Crown className="size-3" aria-hidden />
                Pro & Bisnis
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-neutral-500">
            {locked
              ? "Pilih tampilan produk di halaman publik toko. Upgrade ke Pro untuk akses 3 template."
              : "Pilih tampilan produk di halaman publik. Klik Preview untuk lihat live preview desktop + mobile."}
          </p>
        </div>
        {locked && (
          <Link href="/settings/subscription" className="shrink-0">
            <Button size="sm">
              <Crown className="size-3.5" aria-hidden />
              Upgrade
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {LAYOUTS.map((opt) => {
          const active = value === opt.key;
          const Icon = opt.icon;
          return (
            <div
              key={opt.key}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-3 transition-colors",
                active
                  ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/15"
                  : "border-neutral-200 bg-white",
                locked && "opacity-60",
              )}
            >
              {/* Thumbnail + label — display only, tidak ada aksi */}
              <div className="flex flex-col items-start gap-2">
                <LayoutThumbnail variant={opt.key} active={active} />
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={cn(
                      "size-4",
                      active ? "text-brand-600" : "text-neutral-500",
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      active ? "text-brand-700" : "text-neutral-900",
                    )}
                  >
                    {opt.label}
                  </span>
                  {active && (
                    <Badge variant="brand" className="text-[10px]">
                      Aktif
                    </Badge>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-neutral-600">
                  {opt.description}
                </p>
              </div>

              {/* Actions */}
              <div className="mt-auto flex gap-2">
                {opt.key === "kiosk" && active && onConfigClick && (
                  <button
                    type="button"
                    onClick={onConfigClick}
                    title="Konfigurasi Kiosk"
                    aria-label="Konfigurasi Kiosk"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Settings2 className="size-3.5" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => !locked && onPreview(opt.key)}
                  disabled={locked}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white text-xs font-medium text-neutral-700 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Eye className="size-3.5" aria-hidden />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => !locked && onChange(opt.key)}
                  disabled={locked || active}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-brand-500 bg-brand-500 text-xs font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {active ? "Aktif" : "Terapkan"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// LayoutThumbnail — mini mockup untuk masing-masing variant. Tidak load
// data; cuma rectangles + abstract shapes untuk hint visual.
function LayoutThumbnail({
  variant,
  active,
}: {
  variant: LayoutKey;
  active: boolean;
}) {
  const tileBg = active ? "bg-brand-200" : "bg-neutral-200";
  const wrap = cn(
    "aspect-[4/3] w-full overflow-hidden rounded-md border bg-neutral-50 p-2",
    active ? "border-brand-300" : "border-neutral-200",
  );

  if (variant === "list") {
    return (
      <div className={wrap}>
        <div className="flex h-full flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded bg-white p-1 shadow-sm"
            >
              <div className={cn("size-6 shrink-0 rounded", tileBg)} />
              <div className="flex-1 space-y-1">
                <div className={cn("h-1 w-3/4 rounded", tileBg)} />
                <div className={cn("h-1 w-1/2 rounded opacity-60", tileBg)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (variant === "showcase") {
    return (
      <div className={wrap}>
        <div className="flex h-full flex-col gap-1.5">
          <div className={cn("h-10 rounded", tileBg)} />
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            <div className={cn("rounded", tileBg)} />
            <div className={cn("rounded", tileBg)} />
          </div>
        </div>
      </div>
    );
  }
  if (variant === "compact") {
    return (
      <div className={wrap}>
        <div className="grid h-full grid-cols-4 gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={cn("rounded-sm", tileBg)} />
          ))}
        </div>
      </div>
    );
  }
  if (variant === "magazine") {
    return (
      <div className={wrap}>
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5">
          <div className={cn("col-span-2 row-span-2 rounded", tileBg)} />
          <div className={cn("rounded", tileBg)} />
          <div className={cn("rounded", tileBg)} />
        </div>
      </div>
    );
  }
  if (variant === "feed") {
    return (
      <div className={wrap}>
        <div className="mx-auto flex h-full max-w-[60%] flex-col gap-1.5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={cn("aspect-square w-full rounded", tileBg)}
            />
          ))}
        </div>
      </div>
    );
  }
  // kiosk: 2 kolom tile besar + bar harga di bawah tiap tile
  if (variant === "kiosk") {
    return (
      <div className={wrap}>
        <div className="grid h-full grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className={cn("flex-1 rounded", tileBg)} />
              <div className={cn("h-2 rounded-sm", active ? "bg-brand-400/50" : "bg-neutral-300/50")} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  // katalog: 2 baris horizontal (thumbnail kiri + bar kanan)
  if (variant === "katalog") {
    return (
      <div className={wrap}>
        <div className="flex h-full flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 gap-1.5">
              <div className={cn("aspect-square h-full rounded", tileBg)} />
              <div className="flex flex-1 flex-col justify-center gap-1">
                <div className={cn("h-1.5 rounded-full", active ? "bg-brand-400/60" : "bg-neutral-300/60")} />
                <div className={cn("h-1 w-2/3 rounded-full", active ? "bg-brand-300/40" : "bg-neutral-200/60")} />
                <div className={cn("h-1.5 w-1/2 rounded-full mt-1", active ? "bg-brand-500/60" : "bg-neutral-400/60")} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // poster: 2 kolom portrait tall
  if (variant === "poster") {
    return (
      <div className={wrap}>
        <div className="grid h-full grid-cols-2 gap-1.5">
          {[0, 1].map((i) => (
            <div key={i} className={cn("relative rounded overflow-hidden", tileBg)}>
              <div className="absolute bottom-0 left-0 right-0 h-1/4 rounded-b" style={{
                background: active ? "rgba(5,150,105,0.4)" : "rgba(0,0,0,0.2)"
              }} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  // grid
  return (
    <div className={wrap}>
      <div className="grid h-full grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={cn("rounded", tileBg)} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// KioskConfigDialog — konfigurasi banner kiosk dalam dialog.
// ─────────────────────────────────────────────────────────────────────

type KioskConfig = {
  banner_enabled: boolean;
  banner_slides: { image_url: string }[];
  slide_duration_ms?: number;
  cta_label?: string;
};

const MAX_SLIDES = 5;

function KioskConfigDialog({
  open,
  onClose,
  config,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  config: KioskConfig;
  onChange: (cfg: KioskConfig) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    const onClick = (e: MouseEvent) => { if (e.target === d) onClose(); };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, [onClose]);

  function setEnabled(enabled: boolean) {
    onChange({ ...config, banner_enabled: enabled });
  }

  function setSlide(idx: number, url: string) {
    const slides = [...config.banner_slides];
    slides[idx] = { image_url: url };
    onChange({ ...config, banner_slides: slides });
  }

  function addSlide() {
    if (config.banner_slides.length >= MAX_SLIDES) return;
    onChange({ ...config, banner_slides: [...config.banner_slides, { image_url: "" }] });
  }

  function removeSlide(idx: number) {
    onChange({ ...config, banner_slides: config.banner_slides.filter((_, i) => i !== idx) });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="kiosk-cfg-title"
      className="fixed left-1/2 top-1/2 m-0 w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Settings2 className="size-4 text-brand-600" aria-hidden />
          <h2 id="kiosk-cfg-title" className="font-display text-base font-semibold text-neutral-900">
            Konfigurasi Kiosk
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Body */}
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* Toggle */}
        <label
          htmlFor="kiosk_banner_toggle"
          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-neutral-900">Tampilkan banner intro</p>
            <p className="text-xs text-neutral-600">
              Gambar promo fullscreen saat toko dibuka. Pembeli tap &ldquo;Order Now&rdquo; untuk masuk ke menu.
            </p>
          </div>
          <Switch
            id="kiosk_banner_toggle"
            checked={config.banner_enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </label>

        {/* Slide duration */}
        {config.banner_enabled && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="kiosk_duration" className="text-sm font-medium text-neutral-900">
                Durasi tiap slide
              </label>
              <span className="text-sm font-semibold tabular-nums text-brand-700">
                {Math.round((config.slide_duration_ms ?? 3000) / 1000)} detik
              </span>
            </div>
            <input
              id="kiosk_duration"
              type="range"
              min={5}
              max={60}
              step={1}
              value={Math.round((config.slide_duration_ms ?? 3000) / 1000)}
              onChange={(e) =>
                onChange({ ...config, slide_duration_ms: Number(e.target.value) * 1000 })
              }
              className="h-2 w-full cursor-pointer accent-brand-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>5 dtk</span>
              <span>60 dtk</span>
            </div>
          </div>
        )}

        {/* CTA label */}
        {config.banner_enabled && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kiosk_cta_label">Label tombol masuk</Label>
            <Input
              id="kiosk_cta_label"
              type="text"
              placeholder="Order Now"
              maxLength={30}
              value={config.cta_label ?? ""}
              onChange={(e) =>
                onChange({ ...config, cta_label: e.target.value })
              }
            />
            <p className="text-xs text-neutral-500">
              Kosongkan untuk menggunakan teks default &ldquo;Order Now&rdquo;.
            </p>
          </div>
        )}

        {/* Slide slots */}
        {config.banner_enabled && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-neutral-900">
              Slide gambar ({config.banner_slides.length}/{MAX_SLIDES})
            </p>

            {config.banner_slides.map((slide, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
              >
                <div className="flex-1">
                  <p className="mb-1.5 text-xs font-medium text-neutral-700">Slide {idx + 1}</p>
                  <ImageUploadInput
                    value={slide.image_url}
                    onChange={(url) => setSlide(idx, url)}
                    kind="banner"
                    shape="wide"
                  />
                </div>
                {config.banner_slides.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlide(idx)}
                    aria-label={`Hapus slide ${idx + 1}`}
                    className="mt-6 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            ))}

            {config.banner_slides.length === 0 && (
              <p className="text-sm text-neutral-500">
                Belum ada slide. Klik &ldquo;Tambah Slide&rdquo; untuk upload gambar pertama.
              </p>
            )}

            {config.banner_slides.length < MAX_SLIDES && (
              <button
                type="button"
                onClick={addSlide}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 text-sm font-medium text-neutral-600 transition-colors hover:border-brand-400 hover:text-brand-700"
              >
                <Plus className="size-4" aria-hidden />
                Tambah Slide
              </button>
            )}

            <p className="text-xs text-neutral-500">
              Gunakan gambar landscape (16:9 atau 4:3). Minimum 1 slide jika banner diaktifkan.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3">
        <Button type="button" size="sm" onClick={onClose}>
          Selesai
        </Button>
      </div>
    </dialog>
  );
}
