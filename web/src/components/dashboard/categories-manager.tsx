"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Edit2, Trash2, Check, Tag, X } from "lucide-react";

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
      setAdding(false);
      e.currentTarget.reset();
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

  async function onDelete(c: Category) {
    if (!confirm(`Hapus kategori "${c.name}"? Produk yang ada di kategori ini akan jadi tanpa kategori.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/categories/${c.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal");
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
