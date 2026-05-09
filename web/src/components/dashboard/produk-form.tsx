"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Save, ArrowLeft, Plus, X, Image as ImageIcon, Layers, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PhotoUploader } from "@/components/dashboard/photo-uploader";
import type { Category, Product, Variant } from "@/lib/types";

type VariantDraft = {
  id: string; // empty for new
  name: string;
  sku: string;
  price_cents: number;
  stock: number;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  initial?: Product;
};

export function ProdukForm({ initial }: Props) {
  const router = useRouter();
  const isEditing = !!initial;

  const [photoUrls, setPhotoUrls] = useState<string[]>(initial?.photo_urls ?? []);
  const [photoInput, setPhotoInput] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    (initial?.variants ?? []).map((v: Variant) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      price_cents: v.price_cents,
      stock: v.stock,
    })),
  );
  const [hasVariants, setHasVariants] = useState<boolean>(
    (initial?.variants?.length ?? 0) > 0,
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/categories`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { categories: Category[] };
        setCategories(data.categories ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  function addPhoto() {
    const url = photoInput.trim();
    if (!url) return;
    if (photoUrls.length >= 5) {
      setError("Maks. 5 foto per produk");
      return;
    }
    setPhotoUrls([...photoUrls, url]);
    setPhotoInput("");
    setError(null);
  }

  function removePhoto(idx: number) {
    setPhotoUrls(photoUrls.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const cleanVariants = hasVariants
      ? variants.filter((v) => v.name.trim().length > 0)
      : [];
    const body = {
      category_id: String(fd.get("category_id") ?? ""),
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      description: String(fd.get("description") ?? ""),
      price_cents: Math.round(Number(fd.get("price") ?? 0)) * 100,
      stock: Math.max(0, Number(fd.get("stock") ?? 0)),
      low_stock_threshold: Math.max(0, Number(fd.get("low_stock_threshold") ?? 0)),
      weight_g: Math.max(0, Number(fd.get("weight_g") ?? 0)),
      length_cm: Math.max(0, Number(fd.get("length_cm") ?? 0)),
      width_cm: Math.max(0, Number(fd.get("width_cm") ?? 0)),
      height_cm: Math.max(0, Number(fd.get("height_cm") ?? 0)),
      status: String(fd.get("status") ?? "active"),
      photo_urls: photoUrls,
      is_featured: fd.get("is_featured") === "on",
      variants: cleanVariants,
    };

    try {
      const url = isEditing
        ? `${apiBase}/api/v1/products/${initial.id}`
        : `${apiBase}/api/v1/products`;
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.push("/dasbor/produk");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
      setPending(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Hapus produk "${initial.name}"? Tidak bisa di-undo.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/products/${initial.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Gagal hapus");
      router.push("/dasbor/produk");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Informasi Produk</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">Nama Produk *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={initial?.name ?? ""}
              placeholder="Keripik Singkong Pedas 500g"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={initial?.slug ?? ""}
              placeholder="(otomatis dari nama jika kosong)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category_id">Kategori</Label>
            <Select
              id="category_id"
              name="category_id"
              defaultValue={initial?.category_id ?? ""}
            >
              <option value="">— Tanpa kategori —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {categories.length === 0 && (
              <p className="text-xs text-neutral-500">
                Belum ada kategori.{" "}
                <a
                  href="/dasbor/pengaturan/kategori"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Tambah di Pengaturan
                </a>
                .
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Deskripsi</Label>
            <textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={initial?.description ?? ""}
              placeholder="Bahan, ukuran, cara pakai, atau apa pun yang penting buat pembeli."
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Harga & Stok</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Harga (Rp) *</Label>
            <Input
              id="price"
              name="price"
              type="number"
              required
              min={0}
              step={500}
              defaultValue={initial ? Math.round(initial.price_cents / 100) : ""}
              placeholder="35000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock">Stok *</Label>
            <Input
              id="stock"
              name="stock"
              type="number"
              required
              min={0}
              defaultValue={initial?.stock ?? 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="low_stock_threshold">Alert Stok Rendah</Label>
            <Input
              id="low_stock_threshold"
              name="low_stock_threshold"
              type="number"
              min={0}
              defaultValue={initial?.low_stock_threshold ?? 0}
              placeholder="0 = matikan"
            />
            <p className="text-xs text-neutral-500">
              Tampilkan badge &ldquo;stok rendah&rdquo; saat stok ≤ angka ini.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              name="status"
              defaultValue={initial?.status ?? "active"}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
              <option value="sold_out">Stok habis</option>
            </Select>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Star className="mt-0.5 size-4 text-warning" aria-hidden />
            <div>
              <p className="text-sm font-medium text-neutral-900">
                Tampilkan sebagai produk unggulan
              </p>
              <p className="text-xs text-neutral-600">
                Produk unggulan muncul di section khusus paling atas halaman toko.
              </p>
            </div>
          </div>
          <Switch
            name="is_featured"
            defaultChecked={initial?.is_featured ?? false}
          />
        </label>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Foto Produk</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Maks. 5 foto. Upload langsung dari device atau tempel URL gambar.
          </p>
        </div>

        {photoUrls.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {photoUrls.map((url, i) => (
              <div
                key={i}
                className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Foto ${i + 1}`}
                  className="size-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-neutral-900/70 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100"
                  aria-label="Hapus foto"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <PhotoUploader
            disabled={photoUrls.length >= 5}
            onUploaded={(url) =>
              setPhotoUrls((prev) =>
                prev.length >= 5 ? prev : [...prev, url],
              )
            }
          />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400"
              >
                <ImageIcon className="size-4" />
              </span>
              <Input
                type="url"
                value={photoInput}
                onChange={(e) => setPhotoInput(e.target.value)}
                placeholder="…atau tempel URL gambar"
                className="pl-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPhoto();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addPhoto}
              disabled={!photoInput.trim() || photoUrls.length >= 5}
            >
              <Plus className="size-4" aria-hidden />
              Tambah URL
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
              <Layers className="size-4 text-neutral-500" aria-hidden />
              Varian Produk
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Untuk produk dengan beberapa pilihan (ukuran, warna, dll). Tiap
              varian punya harga + stok sendiri.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => {
                setHasVariants(e.target.checked);
                if (e.target.checked && variants.length === 0) {
                  setVariants([
                    { id: "", name: "", sku: "", price_cents: 0, stock: 0 },
                  ]);
                }
              }}
              className="size-4 rounded border-neutral-300 accent-brand-500 focus:ring-brand-500/30"
            />
            <span className="font-medium text-neutral-900">Pakai varian</span>
          </label>
        </div>

        {hasVariants && (
          <div className="flex flex-col gap-3">
            {variants.length > 0 && (
              <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                <span className="col-span-4">Nama Varian</span>
                <span className="col-span-3">SKU</span>
                <span className="col-span-2">Harga (Rp)</span>
                <span className="col-span-2">Stok</span>
                <span className="col-span-1"></span>
              </div>
            )}
            {variants.map((v, i) => (
              <div
                key={i}
                className="grid grid-cols-12 items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2"
              >
                <Input
                  className="col-span-4"
                  placeholder="Mis. Ukuran S, Warna Merah"
                  value={v.name}
                  onChange={(e) =>
                    setVariants((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  className="col-span-3 font-mono text-xs"
                  placeholder="SKU-001"
                  value={v.sku}
                  onChange={(e) =>
                    setVariants((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  className="col-span-2"
                  type="number"
                  min={0}
                  value={v.price_cents > 0 ? Math.round(v.price_cents / 100) : ""}
                  placeholder="0"
                  onChange={(e) =>
                    setVariants((arr) =>
                      arr.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              price_cents: Math.max(0, Number(e.target.value)) * 100,
                            }
                          : x,
                      ),
                    )
                  }
                />
                <Input
                  className="col-span-2"
                  type="number"
                  min={0}
                  value={v.stock}
                  onChange={(e) =>
                    setVariants((arr) =>
                      arr.map((x, j) =>
                        j === i ? { ...x, stock: Math.max(0, Number(e.target.value)) } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="col-span-1 flex size-10 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
                  onClick={() =>
                    setVariants((arr) => arr.filter((_, j) => j !== i))
                  }
                  aria-label="Hapus varian"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setVariants((arr) => [
                  ...arr,
                  { id: "", name: "", sku: "", price_cents: 0, stock: 0 },
                ])
              }
              className="self-start"
            >
              <Plus className="size-4" aria-hidden />
              Tambah Varian
            </Button>
            <p className="text-xs text-neutral-500">
              Saat varian aktif, harga + stok di atas digantikan oleh tiap varian
              ini. Pembeli akan pilih varian saat checkout.
            </p>
            {initial?.has_variants && variants.length === 0 && (
              <Badge variant="warning">
                Centang &ldquo;Pakai varian&rdquo; akan di-uncheck dan semua varian akan dihapus saat simpan.
              </Badge>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Berat & Dimensi</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Dipakai untuk hitung ongkir. Optional — kalau kosong, ongkir
            dihitung dengan default kecil.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weight_g">Berat (gram)</Label>
            <Input
              id="weight_g"
              name="weight_g"
              type="number"
              min={0}
              defaultValue={initial?.weight_g ?? 0}
              placeholder="500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="length_cm">Panjang (cm)</Label>
            <Input
              id="length_cm"
              name="length_cm"
              type="number"
              min={0}
              defaultValue={initial?.length_cm ?? 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="width_cm">Lebar (cm)</Label>
            <Input
              id="width_cm"
              name="width_cm"
              type="number"
              min={0}
              defaultValue={initial?.width_cm ?? 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="height_cm">Tinggi (cm)</Label>
            <Input
              id="height_cm"
              name="height_cm"
              type="number"
              min={0}
              defaultValue={initial?.height_cm ?? 0}
            />
          </div>
        </div>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onDelete}
              disabled={deleting || pending}
              className="text-danger hover:bg-danger/10"
            >
              <Trash2 className="size-4" aria-hidden />
              {deleting ? "Menghapus…" : "Hapus"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => router.push("/dasbor/produk")}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Batal
          </Button>
          <Button type="submit" size="md" disabled={pending}>
            <Save className="size-4" aria-hidden />
            {pending ? "Menyimpan…" : isEditing ? "Simpan Perubahan" : "Buat Produk"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm font-medium text-danger">{error}</p>
      )}
    </form>
  );
}
