"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Plus,
  PackagePlus,
  Pencil,
  Trash2,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatRupiah } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import type { Material } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const kindLabel: Record<string, string> = {
  ingredient: "Bahan",
  packaging: "Packaging",
};

type FormState = {
  id: string | null;
  name: string;
  kind: "ingredient" | "packaging";
  baseUnit: string;
  costRupiah: number;
  lowStock: number;
};

const emptyForm: FormState = {
  id: null,
  name: "",
  kind: "ingredient",
  baseUnit: "gram",
  costRupiah: 0,
  lowStock: 0,
};

export function MaterialsManager({
  initial,
  total,
  q,
  sort,
  page,
  pageSize,
}: {
  initial: Material[];
  total: number;
  q: string;
  sort: string;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null); // null = closed
  const [restock, setRestock] = useState<Material | null>(null);
  const [toDelete, setToDelete] = useState<Material | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushParams = (next: { q?: string; sort?: string; page?: number }) => {
    const nq = next.q !== undefined ? next.q : search;
    const nsort = next.sort !== undefined ? next.sort : sort;
    const npage = next.page !== undefined ? next.page : page;
    const params = new URLSearchParams();
    if (nq.trim()) params.set("q", nq.trim());
    if (nsort && nsort !== "name") params.set("sort", nsort);
    if (npage > 1) params.set("page", String(npage));
    const qs = params.toString();
    router.push(qs ? `/materials?${qs}` : "/materials");
  };

  // Debounced search → resets to page 1.
  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ q: value, page: 1 }), 350);
  };
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasQuery = q.trim().length > 0;
  const firstTimeEmpty = total === 0 && !hasQuery;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = (page - 1) * pageSize + initial.length;

  const openCreate = () => setForm({ ...emptyForm });
  const openEdit = (m: Material) =>
    setForm({
      id: m.id,
      name: m.name,
      kind: m.kind,
      baseUnit: m.base_unit,
      costRupiah: Math.floor(m.cost_cents / 100),
      lowStock: m.low_stock_threshold,
    });

  const saveForm = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      showError("Nama bahan wajib diisi");
      return;
    }
    if (!form.baseUnit.trim()) {
      showError("Satuan wajib diisi");
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({
        name: form.name.trim(),
        kind: form.kind,
        base_unit: form.baseUnit.trim(),
        cost_cents: Math.max(0, Math.round(form.costRupiah)) * 100,
        low_stock_threshold: Math.max(0, Math.round(form.lowStock)),
      });
      const url = form.id
        ? `${apiBase}/api/v1/materials/${form.id}`
        : `${apiBase}/api/v1/materials`;
      const res = await fetch(url, {
        method: form.id ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal menyimpan");
        return;
      }
      showSuccess(form.id ? "Bahan diperbarui" : "Bahan ditambahkan");
      setForm(null);
      router.refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/materials/${toDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        showError("Gagal menghapus");
        return;
      }
      showSuccess("Bahan dinonaktifkan");
      setToDelete(null);
      router.refresh();
    } catch {
      showError("Gagal menghapus");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {total} bahan terdaftar
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Tambah Bahan
        </Button>
      </div>

      {firstTimeEmpty ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Boxes className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada bahan baku
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Catat bahan & packaging (gula, keju, gelas, plastik take-away) yang
            terpakai per penjualan. Setelah ini kamu bisa pasang resepnya di
            produk supaya konsumsinya tercatat otomatis.
          </p>
          <div className="mt-5">
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              Tambah Bahan Pertama
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Cari bahan…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-neutral-500">
                Urutkan
              </span>
              <Select
                value={sort}
                onChange={(e) => pushParams({ sort: e.target.value, page: 1 })}
                className="w-44"
              >
                <option value="name">Nama (A–Z)</option>
                <option value="stock_asc">Stok terendah</option>
                <option value="stock_desc">Stok tertinggi</option>
              </Select>
            </div>
          </div>

          {initial.length === 0 ? (
            <Card className="py-12 text-center">
              <p className="text-sm text-neutral-600">
                Tidak ada bahan yang cocok dengan{" "}
                <strong>&ldquo;{q}&rdquo;</strong>.
              </p>
            </Card>
          ) : (
            <>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Bahan</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Jenis</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-500">Stok</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-500">Modal / satuan</th>
                <th className="w-px px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {initial.map((m) => (
                <tr key={m.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">{m.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{kindLabel[m.kind] ?? m.kind}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span
                      className={
                        m.low_stock ? "font-semibold text-danger" : "text-neutral-900"
                      }
                    >
                      {m.stock.toLocaleString("id-ID")} {m.base_unit}
                    </span>
                    {m.low_stock && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                        <AlertTriangle className="size-2.5" aria-hidden />
                        Menipis
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-600 tabular-nums">
                    {formatRupiah(m.cost_cents)} / {m.base_unit}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setRestock(m)}
                        title="Restock"
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                      >
                        <PackagePlus className="size-3.5" aria-hidden />
                        Restock
                      </button>
                      <button
                        onClick={() => openEdit(m)}
                        title="Edit"
                        className="flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        onClick={() => setToDelete(m)}
                        title="Nonaktifkan"
                        className="flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-neutral-500">
                  Menampilkan {rangeStart}–{rangeEnd} dari {total}
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => pushParams({ page: page - 1 })}
                    >
                      <ChevronLeft className="size-4" aria-hidden />
                      Sebelumnya
                    </Button>
                    <span className="text-xs tabular-nums text-neutral-500">
                      {page} / {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => pushParams({ page: page + 1 })}
                    >
                      Berikutnya
                      <ChevronRight className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Create / edit modal */}
      {form && (
        <ModalShell title={form.id ? "Edit Bahan" : "Tambah Bahan"} onClose={() => setForm(null)}>
          <div className="flex flex-col gap-3">
            <Field label="Nama bahan">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Gula / Keju / Gelas Large / Plastik"
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis">
                <Select
                  value={form.kind}
                  onChange={(e) =>
                    setForm({ ...form, kind: e.target.value as FormState["kind"] })
                  }
                >
                  <option value="ingredient">Bahan</option>
                  <option value="packaging">Packaging</option>
                </Select>
              </Field>
              <Field label="Satuan">
                <Input
                  list="material-units"
                  value={form.baseUnit}
                  onChange={(e) => setForm({ ...form, baseUnit: e.target.value })}
                  placeholder="gram / ml / pcs"
                />
                <datalist id="material-units">
                  <option value="gram" />
                  <option value="ml" />
                  <option value="pcs" />
                  <option value="lembar" />
                  <option value="buah" />
                </datalist>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Harga modal / satuan (Rp)">
                <Input
                  inputMode="numeric"
                  value={form.costRupiah ? form.costRupiah.toLocaleString("id-ID") : ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      costRupiah: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0,
                    })
                  }
                  placeholder="0"
                />
              </Field>
              <Field label="Alert stok menipis (0 = off)">
                <Input
                  type="number"
                  min={0}
                  value={form.lowStock || ""}
                  onChange={(e) =>
                    setForm({ ...form, lowStock: parseInt(e.target.value, 10) || 0 })
                  }
                  placeholder="0"
                />
              </Field>
            </div>
            {!form.id && (
              <p className="text-xs text-neutral-500">
                Stok awal diatur lewat tombol <strong>Restock</strong> setelah bahan
                dibuat (supaya tercatat di histori).
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setForm(null)} disabled={busy}>
                Batal
              </Button>
              <Button onClick={saveForm} disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Restock modal */}
      {restock && (
        <RestockModal
          material={restock}
          onClose={() => setRestock(null)}
          onDone={() => {
            setRestock(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={doDelete}
        kind="danger"
        busy={busy}
        title="Nonaktifkan bahan?"
        description={
          <>
            Bahan <strong>{toDelete?.name}</strong> tidak akan muncul lagi di daftar.
            Histori konsumsi & laporan tetap tersimpan.
          </>
        }
        confirmLabel="Nonaktifkan"
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-popout">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            aria-label="Tutup"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RestockModal({
  material,
  onClose,
  onDone,
}: {
  material: Material;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState<number>(0);
  const [costRupiah, setCostRupiah] = useState<number>(
    Math.floor(material.cost_cents / 100),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (qty <= 0) {
      showError("Jumlah harus lebih dari 0");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/materials/${material.id}/restock`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: Math.round(qty),
          cost_cents: Math.max(0, Math.round(costRupiah)) * 100,
          note: note.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal restock");
        return;
      }
      showSuccess("Stok ditambahkan");
      onDone();
    } catch {
      showError("Gagal restock");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Restock — ${material.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-neutral-500">
          Stok saat ini:{" "}
          <strong>
            {material.stock.toLocaleString("id-ID")} {material.base_unit}
          </strong>
        </p>
        <Field label={`Jumlah ditambah (${material.base_unit})`}>
          <Input
            type="number"
            min={1}
            value={qty || ""}
            onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
            placeholder="0"
            autoFocus
          />
        </Field>
        <Field label="Harga modal / satuan terkini (Rp)">
          <Input
            inputMode="numeric"
            value={costRupiah ? costRupiah.toLocaleString("id-ID") : ""}
            onChange={(e) =>
              setCostRupiah(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)
            }
            placeholder="0"
          />
        </Field>
        <Field label="Catatan (opsional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mis. beli di Pasar Induk"
          />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Menyimpan…" : "Tambah Stok"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
