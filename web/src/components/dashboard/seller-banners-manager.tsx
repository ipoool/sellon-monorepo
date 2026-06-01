"use client";

import { useRef, useState, type FormEvent, type DragEvent } from "react";
import {
  Upload,
  Trash2,
  Loader2,
  ImageIcon,
  GripVertical,
  Save,
  Store,
  QrCode,
  MonitorPlay,
  Crown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useBisnisGate } from "@/components/dashboard/bisnis-gate";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { SellerBanner, SellerBannerPlacement } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Placement metadata — copy + the visual ratio guidance shown to the seller.
const PLACEMENTS: {
  key: SellerBannerPlacement;
  label: string;
  icon: typeof Store;
  hint: string;
  ratio: string;
  // Thumbnail aspect in the management list (queue banners are portrait).
  portrait?: boolean;
  // Order-meja / antrian are dine-in surfaces → Bisnis-only (BE returns 402).
  bisnisOnly?: boolean;
}[] = [
  {
    key: "storefront",
    label: "Storefront",
    icon: Store,
    hint: "Tampil di halaman toko, di antara header dan katalog produk.",
    ratio: "Rasio ideal 16:5 (mis. 1600×500). JPG/PNG/WebP/GIF, maks 15 MB.",
  },
  {
    key: "table_order",
    label: "Order Meja",
    icon: QrCode,
    hint: "Tampil di halaman pesan-sendiri via QR meja, di atas daftar menu.",
    ratio: "Rasio ideal 16:5 (mis. 1600×500). JPG/PNG/WebP/GIF, maks 15 MB.",
    bisnisOnly: true,
  },
  {
    key: "customer_queue",
    label: "Antrian Pesanan",
    icon: MonitorPlay,
    hint: "Tampil penuh di sisi kanan layar antrian pesanan (TV/tablet kasir).",
    ratio: "Rasio ideal potret/persegi (mis. 1080×1350) — tampil penuh separuh layar. Maks 15 MB.",
    portrait: true,
    bisnisOnly: true,
  },
];

export function SellerBannersManager({ initial }: { initial: SellerBanner[] }) {
  // `locked` is true below the Bisnis tier → order-meja / antrian placements
  // open the upgrade dialog instead of switching (BE also returns 402).
  const { locked, openGate } = useBisnisGate();
  // Flat client-managed list (server is source of truth, we mutate locally per
  // API response). The active placement tab filters what's shown + uploaded.
  const [items, setItems] = useState<SellerBanner[]>(() =>
    [...initial].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [placement, setPlacement] = useState<SellerBannerPlacement>("storefront");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SellerBanner | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = PLACEMENTS.find((p) => p.key === placement)!;
  // The active placement is locked when it's a Bisnis-only surface and the plan
  // is below Bisnis. New uploads are blocked, but existing banners (from a prior
  // Bisnis period) stay manageable so the seller can clean them up.
  const lockedActive = !!meta.bisnisOnly && locked;
  const current = items
    .filter((b) => b.placement === placement)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Raw PUT — `silent` skips the per-row toast (used by reorder which fires
  // several PUTs at once).
  const putBanner = async (b: SellerBanner, silent = false) => {
    try {
      const res = await fetch(`${apiBase}/api/v1/store/banners/${b.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: b.title,
          link_url: b.link_url,
          is_active: b.is_active,
          sort_order: b.sort_order,
        }),
      });
      if (!res.ok) {
        if (!silent) showError("Gagal menyimpan");
        return false;
      }
      return true;
    } catch {
      if (!silent) showError("Gagal menyimpan");
      return false;
    }
  };

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    // Defense-in-depth: never POST a Bisnis-only placement on a locked plan
    // (the form is hidden in this state; the BE also returns 402).
    if (lockedActive) {
      openGate(`Banner ${meta.label}`);
      return;
    }
    if (!file) {
      showError("Pilih file gambar dulu");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("placement", placement);
      fd.append("title", title.trim());
      fd.append("link_url", linkUrl.trim());
      fd.append("sort_order", String(current.length));
      const res = await fetch(`${apiBase}/api/v1/store/banners`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // BE error bodies vary: {error} for plain errors, {message} for the
        // 402 FEATURE_LOCKED backstop. Prefer whichever is present.
        showError(data.message || data.error || "Gagal upload banner");
        return;
      }
      setItems((prev) => [...prev, data as SellerBanner]);
      setFile(null);
      setTitle("");
      setLinkUrl("");
      if (fileRef.current) fileRef.current.value = "";
      showSuccess("Banner ditambahkan");
    } catch {
      showError("Gagal upload banner");
    } finally {
      setUploading(false);
    }
  };

  const save = async (b: SellerBanner) => {
    setBusyId(b.id);
    const ok = await putBanner(b);
    if (ok) showSuccess("Tersimpan");
    setBusyId(null);
  };

  const toggleActive = async (b: SellerBanner, isActive: boolean) => {
    const next = { ...b, is_active: isActive };
    setItems((prev) => prev.map((x) => (x.id === b.id ? next : x)));
    setBusyId(b.id);
    const ok = await putBanner(next, true);
    if (!ok) {
      showError("Gagal menyimpan");
      setItems((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    }
    setBusyId(null);
  };

  const del = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setBusyId(id);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/banners/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        showError("Gagal menghapus");
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
      setPendingDelete(null);
      showSuccess("Banner dihapus");
    } catch {
      showError("Gagal menghapus");
    } finally {
      setBusyId(null);
    }
  };

  const setField = (id: string, field: "title" | "link_url", value: string) =>
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, [field]: value } : x)),
    );

  // ── Drag reorder (scoped to the active placement) ─────────────────────────
  const onDrop = async (toId: string) => {
    const from = current.findIndex((x) => x.id === dragId);
    const to = current.findIndex((x) => x.id === toId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;

    const arr = [...current];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    // Renumber this placement's sort_order to match the new visual order.
    const renumbered = arr.map((x, i) => ({ ...x, sort_order: i }));

    const prevItems = items;
    setItems((prev) =>
      prev.map((x) => renumbered.find((r) => r.id === x.id) ?? x),
    );

    const changed = renumbered.filter((x) => {
      const old = current.find((o) => o.id === x.id);
      return old && old.sort_order !== x.sort_order;
    });
    const results = await Promise.all(changed.map((x) => putBanner(x, true)));
    if (results.some((ok) => !ok)) {
      showError("Sebagian urutan gagal disimpan");
      setItems(prevItems);
    } else {
      showSuccess("Urutan disimpan");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">Banner Toko</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Kelola banner promo untuk tiap area: storefront, halaman order meja, dan layar antrian pesanan.
        </p>
      </div>

      {/* Placement tabs */}
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {PLACEMENTS.map(({ key, label, icon: Icon, bisnisOnly }) => {
          const active = key === placement;
          const tabLocked = !!bisnisOnly && locked;
          const n = items.filter((b) => b.placement === key).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                // Locked + empty → just the upsell dialog. Locked + has existing
                // banners (e.g. after a downgrade) → still let the seller open
                // the tab to manage/delete them; new uploads stay blocked below.
                if (tabLocked && n === 0) {
                  openGate(`Banner ${label}`);
                  return;
                }
                setPlacement(key);
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
              {tabLocked && (
                <Crown className="size-3.5 shrink-0 text-amber-500" aria-hidden />
              )}
              {n > 0 && (
                <span
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                    active ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload form — or an upsell when this placement is Bisnis-locked
          (the seller reached it to manage pre-existing banners). */}
      {lockedActive ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:flex-row sm:py-2 sm:text-left">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Crown className="size-6" aria-hidden />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-neutral-900">
                Banner {meta.label} untuk paket Bisnis
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Menambah banner baru di area ini hanya tersedia di paket Bisnis. Banner
                yang sudah ada masih bisa kamu nonaktifkan atau hapus di bawah.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => openGate(`Banner ${meta.label}`)}
              className="shrink-0"
            >
              <Crown className="size-4" aria-hidden />
              Lihat Paket Bisnis
            </Button>
          </div>
        </Card>
      ) : (
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Upload className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Tambah Banner — {meta.label}</h2>
        </div>
        <p className="mb-3 text-xs text-neutral-500">{meta.hint}</p>
        <form onSubmit={upload} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-neutral-600">Gambar banner</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            <span className="text-xs text-neutral-400">{meta.ratio}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Judul / label (opsional)</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Promo Lebaran" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Link saat diklik (opsional)</span>
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." inputMode="url" />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {uploading ? "Mengunggah..." : "Unggah Banner"}
            </Button>
          </div>
        </form>
      </Card>
      )}

      {/* List for active placement */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <ImageIcon className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Daftar Banner</h2>
          <span className="text-xs text-neutral-400">{current.length} banner</span>
        </div>
        {current.length > 1 && (
          <p className="mb-4 text-xs text-neutral-400">
            Seret ikon <GripVertical className="inline size-3.5 align-text-bottom" aria-hidden /> untuk mengubah urutan tampil.
          </p>
        )}
        {current.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            Belum ada banner untuk {meta.label}. Unggah gambar di atas untuk menampilkannya.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {current.map((b) => (
              <div
                key={b.id}
                data-banner-row
                onDragOver={(e: DragEvent) => {
                  if (!dragId || dragId === b.id) return;
                  e.preventDefault();
                  setOverId(b.id);
                }}
                onDragLeave={() => setOverId((cur) => (cur === b.id ? null : cur))}
                onDrop={(e: DragEvent) => {
                  e.preventDefault();
                  onDrop(b.id);
                }}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 transition-colors sm:flex-row sm:items-center",
                  dragId === b.id && "opacity-40",
                  overId === b.id && "border-brand-400 ring-2 ring-brand-400/40",
                )}
              >
                <button
                  type="button"
                  draggable
                  onDragStart={(e: DragEvent) => {
                    setDragId(b.id);
                    e.dataTransfer.effectAllowed = "move";
                    const row = (e.currentTarget as HTMLElement).closest("[data-banner-row]");
                    if (row) e.dataTransfer.setDragImage(row as Element, 20, 20);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  aria-label="Seret untuk mengubah urutan"
                  title="Seret untuk mengubah urutan"
                  className="flex shrink-0 cursor-grab items-center justify-center self-center rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 active:cursor-grabbing"
                >
                  <GripVertical className="size-5" aria-hidden />
                </button>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.image_url}
                  alt={b.title || "Banner"}
                  className={cn(
                    "w-full shrink-0 rounded-lg object-cover",
                    meta.portrait ? "aspect-[4/5] sm:w-28" : "aspect-[16/5] sm:w-48",
                  )}
                />
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-neutral-500">Judul</span>
                    <Input
                      value={b.title}
                      onChange={(e) => setField(b.id, "title", e.target.value)}
                      placeholder="(tanpa judul)"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-neutral-500">Link</span>
                    <Input
                      value={b.link_url}
                      onChange={(e) => setField(b.id, "link_url", e.target.value)}
                      placeholder="https://..."
                      inputMode="url"
                    />
                  </label>
                  <div className="flex items-end gap-3 sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-700">
                      <Switch checked={b.is_active} onChange={(e) => toggleActive(b, e.target.checked)} />
                      {b.is_active ? "Aktif" : "Nonaktif"}
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:flex-col">
                  <Button size="sm" variant="outline" onClick={() => save(b)} disabled={busyId === b.id}>
                    {busyId === b.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                    Simpan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingDelete(b)}
                    disabled={busyId === b.id}
                    className="text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Hapus
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={del}
        kind="danger"
        title="Hapus banner?"
        description="Banner ini akan dihapus permanen dan tidak lagi tampil."
        confirmLabel="Hapus"
      />
    </div>
  );
}
