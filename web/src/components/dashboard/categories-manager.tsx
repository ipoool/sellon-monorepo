"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  Tag,
  X,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Category } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function CategoriesManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  // Sync the dialog's open state with React state. We bind native cancel
  // (Esc) + backdrop click to close the dialog cleanly.
  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (pendingDelete && !dialog.open) dialog.showModal();
    if (!pendingDelete && dialog.open) dialog.close();
  }, [pendingDelete]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) setPendingDelete(null);
    };
    const onCancel = () => setPendingDelete(null);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  }, []);

  async function refresh() {
    try {
      const res = await fetch(`${apiBase}/api/v1/categories`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { categories: Category[] };
      setCategories(data.categories ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    try {
      const res = await fetch(`${apiBase}/api/v1/categories`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Closing `adding` unmounts the form, so calling .reset() after this
      // line crashes ("Cannot read properties of null"). Unmount alone is
      // enough to clear the field; next open re-mounts a fresh form.
      setAdding(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function onRename(id: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/categories/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(c: Category) {
    setDeleteError(null);
    setPendingDelete(c);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/categories/${pendingDelete.id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-900">Kategori Produk</h3>
          <p className="mt-0.5 text-sm text-neutral-600">
            Atur kategori untuk pengelompokan produk + filter di halaman toko.
          </p>
        </div>
        {!adding && (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Tambah
          </Button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={onCreate}
          className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input
            name="name"
            required
            autoFocus
            placeholder="Nama kategori (mis. Makanan, Minuman)"
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button type="submit" size="md" disabled={busy}>
              <Check className="size-4" aria-hidden />
              Simpan
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              Batal
            </Button>
          </div>
        </form>
      )}

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Memuat…</p>
      ) : categories.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
          Belum ada kategori. Tambah minimal satu untuk pengelompokan produk-mu.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Tag className="size-4 shrink-0 text-neutral-400" aria-hidden />
              {editingId === c.id ? (
                <InlineEdit
                  initial={c.name}
                  onSave={(v) => onRename(c.id, v)}
                  onCancel={() => setEditingId(null)}
                  disabled={busy}
                />
              ) : (
                <>
                  <div className="flex flex-1 items-center gap-2">
                    <span className="font-medium text-neutral-900">{c.name}</span>
                    <Badge variant="default">{c.product_count} produk</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(c.id)}
                      disabled={busy}
                      aria-label="Edit"
                    >
                      <Edit2 className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(c)}
                      disabled={busy}
                      className="text-danger hover:bg-danger/10"
                      aria-label="Hapus"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Delete confirmation dialog */}
      <dialog
        ref={deleteDialogRef}
        aria-labelledby="delete-cat-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(420px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start gap-3 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="delete-cat-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Hapus kategori &ldquo;{pendingDelete?.name}&rdquo;?
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              Produk yang ada di kategori ini akan jadi tanpa kategori. Aksi
              ini tidak bisa di-undo.
            </p>
            {deleteError && (
              <p className="mt-2 text-sm font-medium text-danger">
                {deleteError}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPendingDelete(null)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={confirmDelete}
            disabled={busy}
          >
            <Trash2 className="size-4" aria-hidden />
            {busy ? "Menghapus…" : "Hapus"}
          </Button>
        </div>
      </dialog>
    </Card>
  );
}

function InlineEdit({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const [v, setV] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSave(v.trim());
      }}
      className="flex flex-1 items-center gap-2"
    >
      <Input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="flex-1"
        disabled={disabled}
      />
      <Button type="submit" size="sm" disabled={disabled || !v.trim()}>
        <Check className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onCancel}
        disabled={disabled}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </form>
  );
}
