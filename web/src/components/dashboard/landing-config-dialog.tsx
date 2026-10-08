"use client";

import { useEffect, useRef } from "react";
import {
  Settings2,
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Images,
  LayoutGrid,
  Image as ImageIcon,
  Type,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ImageUploadInput } from "@/components/dashboard/image-upload-input";
import { cn } from "@/lib/utils";
import {
  blankSection,
  MAX_LANDING_SECTIONS,
  MAX_SLIDES_PER_SLIDER,
  type LandingBackground,
  type LandingConfig,
  type LandingSection,
  type LandingSectionType,
} from "@/lib/landing-config";

type Category = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  config: LandingConfig;
  onChange: (cfg: LandingConfig) => void;
  categories: Category[];
};

const BACKGROUNDS: { key: LandingBackground; label: string; hint: string; swatch: string }[] = [
  { key: "white", label: "Putih", hint: "Bersih, foto produk dominan", swatch: "bg-white border-neutral-300" },
  { key: "soft", label: "Abu lembut", hint: "Kartu produk lebih menonjol", swatch: "bg-neutral-100 border-neutral-300" },
  { key: "tinted", label: "Warna brand", hint: "Ikut warna tema toko", swatch: "bg-brand-100 border-brand-300" },
  { key: "dark", label: "Gelap", hint: "Premium, teks putih", swatch: "bg-neutral-900 border-neutral-700" },
];

const SECTION_TYPES: { key: LandingSectionType; label: string; icon: typeof Images }[] = [
  { key: "slider", label: "Slider gambar", icon: Images },
  { key: "products", label: "Baris produk", icon: LayoutGrid },
  { key: "banner", label: "Banner promo", icon: ImageIcon },
  { key: "text", label: "Teks", icon: Type },
];

/**
 * Editor for the "Landing" storefront template: page background, announcement
 * bar, and an ordered list of sections the seller adds, removes and reorders.
 * Edits are held in the parent form's state and persisted with the rest of
 * the storefront settings — same flow as the kiosk config.
 */
export function LandingConfigDialog({ open, onClose, config, onChange, categories }: Props) {
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

  function patchSection(idx: number, patch: Partial<LandingSection>) {
    const sections = config.sections.map((s, i) =>
      i === idx ? ({ ...s, ...patch } as LandingSection) : s,
    );
    onChange({ ...config, sections });
  }
  function addSection(type: LandingSectionType) {
    if (config.sections.length >= MAX_LANDING_SECTIONS) return;
    onChange({ ...config, sections: [...config.sections, blankSection(type)] });
  }
  function removeSection(idx: number) {
    onChange({ ...config, sections: config.sections.filter((_, i) => i !== idx) });
  }
  function move(idx: number, dir: -1 | 1) {
    const to = idx + dir;
    if (to < 0 || to >= config.sections.length) return;
    const sections = [...config.sections];
    [sections[idx], sections[to]] = [sections[to], sections[idx]];
    onChange({ ...config, sections });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="landing-cfg-title"
      className="fixed left-1/2 top-1/2 m-0 w-[min(680px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Settings2 className="size-4 text-brand-600" aria-hidden />
          <h2 id="landing-cfg-title" className="font-display text-base font-semibold text-neutral-900">
            Susun Halaman Toko
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

      <div className="flex max-h-[72vh] flex-col gap-6 overflow-y-auto px-5 py-4">
        {/* Background */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-neutral-900">Latar halaman</p>
          <p className="-mt-1 text-xs text-neutral-500">
            Warna utama tetap dari &ldquo;Warna tema&rdquo; di atas — ini mengatur latar di belakangnya.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BACKGROUNDS.map((b) => {
              const active = config.background === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => onChange({ ...config, background: b.key })}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors",
                    active ? "border-brand-500 bg-brand-50" : "border-neutral-200 hover:border-neutral-300",
                  )}
                  aria-pressed={active}
                >
                  <span className={cn("h-6 w-full rounded border", b.swatch)} aria-hidden />
                  <span className="text-xs font-semibold text-neutral-900">{b.label}</span>
                  <span className="text-[11px] leading-snug text-neutral-500">{b.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Announcement bar */}
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3.5">
          <label htmlFor="landing_ann_toggle" className="flex cursor-pointer items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-900">Bar pengumuman</p>
              <p className="text-xs text-neutral-600">Strip di paling atas, misal &ldquo;Diskon ongkir 50% min. order 100K&rdquo;.</p>
            </div>
            <Switch
              id="landing_ann_toggle"
              checked={config.announcement.enabled}
              onChange={(e) =>
                onChange({ ...config, announcement: { ...config.announcement, enabled: e.target.checked } })
              }
            />
          </label>
          {config.announcement.enabled && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="landing_ann_text">Teks</Label>
                <Input
                  id="landing_ann_text"
                  maxLength={160}
                  placeholder="Gratis ongkir untuk pembelian di atas Rp 100.000"
                  value={config.announcement.text}
                  onChange={(e) =>
                    onChange({ ...config, announcement: { ...config.announcement, text: e.target.value } })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:w-56">
                <Label htmlFor="landing_ann_link">Link (opsional)</Label>
                <Input
                  id="landing_ann_link"
                  type="url"
                  placeholder="https://…"
                  value={config.announcement.link_url ?? ""}
                  onChange={(e) =>
                    onChange({ ...config, announcement: { ...config.announcement, link_url: e.target.value } })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-900">
              Section ({config.sections.length}/{MAX_LANDING_SECTIONS})
            </p>
            <p className="text-xs text-neutral-500">Urutan di sini = urutan di halaman toko.</p>
          </div>

          {config.sections.map((s, idx) => (
            <SectionEditor
              key={s.id}
              section={s}
              index={idx}
              total={config.sections.length}
              categories={categories}
              onPatch={(patch) => patchSection(idx, patch)}
              onRemove={() => removeSection(idx)}
              onMove={(dir) => move(idx, dir)}
            />
          ))}

          {config.sections.length < MAX_LANDING_SECTIONS && (
            <div className="rounded-lg border border-dashed border-neutral-300 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-600">Tambah section</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SECTION_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => addSection(t.key)}
                    className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:border-brand-400 hover:text-brand-700"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    <t.icon className="size-3.5" aria-hidden />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-5 py-3">
        <p className="text-xs text-neutral-500">Perubahan tersimpan saat kamu klik &ldquo;Simpan&rdquo; di halaman ini.</p>
        <Button type="button" size="sm" onClick={onClose}>
          Selesai
        </Button>
      </div>
    </dialog>
  );
}

function SectionEditor({
  section,
  index,
  total,
  categories,
  onPatch,
  onRemove,
  onMove,
}: {
  section: LandingSection;
  index: number;
  total: number;
  categories: Category[];
  onPatch: (patch: Partial<LandingSection>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const meta = SECTION_TYPES.find((t) => t.key === section.type)!;
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2">
        <Icon className="size-4 text-brand-600" aria-hidden />
        <span className="text-sm font-semibold text-neutral-900">
          {index + 1}. {meta.label}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Naik"
            className="inline-flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
          >
            <ChevronUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Turun"
            className="inline-flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Hapus section"
            className="inline-flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {section.type === "slider" && (
          <>
            {section.slides.map((sl, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex flex-1 flex-col gap-2">
                  <p className="text-xs font-medium text-neutral-700">Slide {i + 1}</p>
                  <ImageUploadInput
                    value={sl.image_url}
                    kind="banner"
                    shape="wide"
                    onChange={(url) => {
                      const slides = section.slides.map((x, j) => (j === i ? { ...x, image_url: url } : x));
                      onPatch({ slides });
                    }}
                  />
                  <Input
                    type="url"
                    placeholder="Link saat slide diklik (opsional)"
                    value={sl.link_url ?? ""}
                    onChange={(e) => {
                      const slides = section.slides.map((x, j) => (j === i ? { ...x, link_url: e.target.value } : x));
                      onPatch({ slides });
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onPatch({ slides: section.slides.filter((_, j) => j !== i) })}
                  aria-label={`Hapus slide ${i + 1}`}
                  className="mt-5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            {section.slides.length < MAX_SLIDES_PER_SLIDER && (
              <button
                type="button"
                onClick={() => onPatch({ slides: [...section.slides, { image_url: "", link_url: "" }] })}
                className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 text-sm font-medium text-neutral-600 hover:border-brand-400 hover:text-brand-700"
              >
                <Plus className="size-4" aria-hidden />
                Tambah slide ({section.slides.length}/{MAX_SLIDES_PER_SLIDER})
              </button>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor={`auto-${section.id}`}>Ganti slide otomatis</Label>
              <span className="text-sm font-semibold tabular-nums text-brand-700">
                {section.autoplay_ms ? `${Math.round(section.autoplay_ms / 1000)} dtk` : "Mati"}
              </span>
            </div>
            <input
              id={`auto-${section.id}`}
              type="range"
              min={0}
              max={15}
              step={1}
              value={Math.round((section.autoplay_ms ?? 0) / 1000)}
              onChange={(e) => onPatch({ autoplay_ms: Number(e.target.value) * 1000 })}
              className="h-2 w-full cursor-pointer accent-brand-500"
            />
            <p className="text-xs text-neutral-500">Gambar landscape (16:6). Slider tanpa gambar tidak ditampilkan.</p>
          </>
        )}

        {section.type === "products" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`title-${section.id}`}>Judul</Label>
              <Input
                id={`title-${section.id}`}
                maxLength={80}
                placeholder="Best Seller"
                value={section.title}
                onChange={(e) => onPatch({ title: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`src-${section.id}`}>Produk yang tampil</Label>
                <Select
                  id={`src-${section.id}`}
                  value={section.source}
                  onChange={(e) => onPatch({ source: e.target.value as typeof section.source })}
                >
                  <option value="featured">Produk unggulan</option>
                  <option value="newest">Produk terbaru</option>
                  <option value="category">Per kategori</option>
                  <option value="all">Semua produk</option>
                </Select>
              </div>
              {section.source === "category" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`cat-${section.id}`}>Kategori</Label>
                  <Select
                    id={`cat-${section.id}`}
                    value={section.category_id ?? ""}
                    onChange={(e) => onPatch({ category_id: e.target.value })}
                  >
                    <option value="">Pilih kategori…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`lim-${section.id}`}>Maks. produk</Label>
                <Input
                  id={`lim-${section.id}`}
                  type="number"
                  min={0}
                  max={48}
                  value={section.limit}
                  onChange={(e) => onPatch({ limit: Math.max(0, Math.min(48, Number(e.target.value) || 0)) })}
                />
                <p className="text-[11px] text-neutral-500">0 = tampilkan semua</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`col-${section.id}`}>Kolom (desktop)</Label>
                <Select
                  id={`col-${section.id}`}
                  value={String(section.columns)}
                  onChange={(e) => onPatch({ columns: Number(e.target.value) as 3 | 4 | 6 })}
                >
                  <option value="3">3 kolom</option>
                  <option value="4">4 kolom</option>
                  <option value="6">6 kolom</option>
                </Select>
              </div>
            </div>
            {section.source === "featured" && (
              <p className="text-xs text-neutral-500">
                Produk unggulan diatur per produk lewat toggle &ldquo;Tampilkan sebagai produk unggulan&rdquo;.
              </p>
            )}
          </>
        )}

        {section.type === "banner" && (
          <>
            <ImageUploadInput
              value={section.image_url}
              kind="banner"
              shape="wide"
              onChange={(url) => onPatch({ image_url: url })}
            />
            <Input
              type="url"
              placeholder="Link saat banner diklik (opsional)"
              value={section.link_url ?? ""}
              onChange={(e) => onPatch({ link_url: e.target.value })}
            />
            <p className="text-xs text-neutral-500">Gambar lebar penuh, cocok untuk promo &ldquo;Buy 1 Get 1&rdquo; atau pengumuman musiman.</p>
          </>
        )}

        {section.type === "text" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tt-${section.id}`}>Judul</Label>
              <Input
                id={`tt-${section.id}`}
                maxLength={120}
                placeholder="Tentang kami"
                value={section.title}
                onChange={(e) => onPatch({ title: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tb-${section.id}`}>Isi</Label>
              <textarea
                id={`tb-${section.id}`}
                rows={4}
                maxLength={2000}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="Keripik buah asli tanpa pengawet, dibuat segar setiap hari…"
                value={section.body}
                onChange={(e) => onPatch({ body: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name={`al-${section.id}`} checked={section.align === "center"} onChange={() => onPatch({ align: "center" })} />
                Rata tengah
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name={`al-${section.id}`} checked={section.align === "left"} onChange={() => onPatch({ align: "left" })} />
                Rata kiri
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
