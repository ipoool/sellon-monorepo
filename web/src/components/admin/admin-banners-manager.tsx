"use client";

import { useRef, useState, type FormEvent, type DragEvent } from "react";
import { Upload, Trash2, Loader2, ImageIcon, GripVertical, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { PlatformBanner } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function AdminBannersManager({ initial }: { initial: PlatformBanner[] }) {
  // Client-managed list: server is source-of-truth but we mutate locally from
  // each API response so the UI stays snappy without full-page refreshes.
  // Kept sorted by sort_order so drag reordering reads naturally.
  const [items, setItems] = useState<PlatformBanner[]>(() =>
    [...initial].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlatformBanner | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Raw PUT — returns success; `silent` skips the per-item toast (used by the
  // reorder flow which fires several PUTs at once).
  const putBanner = async (b: PlatformBanner, silent = false) => {
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/banners/${b.id}`, {
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
    if (!file) {
      showError("Pilih file gambar dulu");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      fd.append("link_url", linkUrl.trim());
      fd.append("sort_order", String(items.length));
      const res = await fetch(`${apiBase}/api/v1/admin/banners`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Gagal upload banner");
        return;
      }
      setItems((prev) => [...prev, data as PlatformBanner]);
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

  // Save title/link/active edits for one row.
  const save = async (b: PlatformBanner) => {
    setBusyId(b.id);
    const ok = await putBanner(b);
    if (ok) showSuccess("Tersimpan");
    setBusyId(null);
  };

  // Toggle active immediately (optimistic + persist + revert on failure).
  const toggleActive = async (b: PlatformBanner, isActive: boolean) => {
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
      const res = await fetch(`${apiBase}/api/v1/admin/banners/${id}`, {
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

  const setField = (id: string, field: keyof PlatformBanner, value: string) =>
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, [field]: value } : x)),
    );

  // ── Drag reorder ──────────────────────────────────────────────────────
  const onDrop = async (toId: string) => {
    const from = items.findIndex((x) => x.id === dragId);
    const to = items.findIndex((x) => x.id === toId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;

    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    // Renumber sort_order to match the new visual order.
    const renumbered = arr.map((x, i) => ({ ...x, sort_order: i }));
    const prev = items;
    setItems(renumbered);

    // Persist only the rows whose sort_order actually changed.
    const changed = renumbered.filter((x) => {
      const old = prev.find((o) => o.id === x.id);
      return old && old.sort_order !== x.sort_order;
    });
    const results = await Promise.all(changed.map((x) => putBanner(x, true)));
    if (results.some((ok) => !ok)) {
      showError("Sebagian urutan gagal disimpan");
      setItems(prev); // revert to pre-drag order
    } else {
      showSuccess("Urutan disimpan");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Upload form */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Upload className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Tambah Banner</h2>
        </div>
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
            <span className="text-xs text-neutral-400">
              Rasio ideal 16:5 (mis. 1600×500). JPG/PNG/WebP/GIF, maks 15 MB.
            </span>
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

      {/* List */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <ImageIcon className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Daftar Banner</h2>
          <span className="text-xs text-neutral-400">{items.length} banner</span>
        </div>
        {items.length > 1 && (
          <p className="mb-4 text-xs text-neutral-400">
            Seret ikon <GripVertical className="inline size-3.5 align-text-bottom" aria-hidden /> untuk mengubah urutan tampil di slider.
          </p>
        )}
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            Belum ada banner. Unggah gambar di atas — banner akan muncul sebagai slider di dashboard seller.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((b) => (
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
                {/* Drag handle */}
                <button
                  type="button"
                  draggable
                  onDragStart={(e: DragEvent) => {
                    setDragId(b.id);
                    e.dataTransfer.effectAllowed = "move";
                    const row = (e.currentTarget as HTMLElement).closest(
                      "[data-banner-row]",
                    );
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
                  className="aspect-[16/5] w-full shrink-0 rounded-lg object-cover sm:w-48"
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
                      <Switch
                        checked={b.is_active}
                        onChange={(e) => toggleActive(b, e.target.checked)}
                      />
                      {b.is_active ? "Aktif" : "Nonaktif"}
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:flex-col">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => save(b)}
                    disabled={busyId === b.id}
                  >
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
        description="Banner ini akan dihapus permanen dan tidak lagi tampil di dashboard seller."
        confirmLabel="Hapus"
      />
    </div>
  );
}
