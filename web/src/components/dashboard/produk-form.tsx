"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Trash2, Save, ArrowLeft, Plus, X, Layers, Star, Box, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PhotoUploader } from "@/components/dashboard/photo-uploader";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
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
  const { push, refresh } = useRouter();
  const isEditing = !!initial;

  const [photoUrls, setPhotoUrls] = useState<string[]>(initial?.photo_urls ?? []);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");
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
  const [productType, setProductType] = useState<"physical" | "digital">(
    initial?.product_type ?? "physical",
  );
  const [digitalDeliveryURL, setDigitalDeliveryURL] = useState<string>(
    initial?.digital_delivery_url ?? "",
  );
  const [digitalFileURL, setDigitalFileURL] = useState<string>(
    initial?.digital_file_url ?? "",
  );
  const [digitalInstructions, setDigitalInstructions] = useState<string>(
    initial?.digital_instructions ?? "",
  );
  const isDigital = productType === "digital";

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

  function removePhoto(idx: number) {
    setPhotoUrls(photoUrls.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const cleanVariants = hasVariants
      ? variants.filter((v) => v.name.trim().length > 0)
      : [];

    // When variants are active, the parent product's price/stock are
    // derived (min price across variants, summed stock) so the storefront
    // "Mulai Rp X" badge and list aggregates can't drift below the real
    // variant prices. The Harga/Stok inputs above are ignored in this
    // branch - see the helper text in the form.
    let priceCents: number;
    let stock: number;
    if (hasVariants) {
      if (cleanVariants.length === 0) {
        showError("Tambah minimal 1 varian (atau matikan 'Pakai varian').");
        setPending(false);
        return;
      }
      const pricedVariants = cleanVariants.filter((v) => v.price_cents > 0);
      if (pricedVariants.length === 0) {
        showError("Minimal 1 varian harus punya harga > 0.");
        setPending(false);
        return;
      }
      priceCents = Math.min(...pricedVariants.map((v) => v.price_cents));
      stock = cleanVariants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
    } else {
      priceCents = Math.round(Number(fd.get("price") ?? 0)) * 100;
      stock = Math.max(0, Number(fd.get("stock") ?? 0));
    }

    // Digital products: server requires at least one delivery channel.
    // Validate locally too so seller doesn't roundtrip just for that.
    if (isDigital) {
      const hasAny =
        digitalDeliveryURL.trim() !== "" ||
        digitalFileURL.trim() !== "" ||
        digitalInstructions.trim() !== "";
      if (!hasAny) {
        showError(
          "Produk digital butuh minimal salah satu: link delivery, file upload, atau instruksi.",
        );
        setPending(false);
        return;
      }
    }

    const body = {
      category_id: categoryId,
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      description: String(fd.get("description") ?? ""),
      price_cents: priceCents,
      stock: isDigital ? 0 : stock,
      low_stock_threshold: isDigital
        ? 0
        : Math.max(0, Number(fd.get("low_stock_threshold") ?? 0)),
      weight_g: isDigital ? 0 : Math.max(0, Number(fd.get("weight_g") ?? 0)),
      length_cm: isDigital ? 0 : Math.max(0, Number(fd.get("length_cm") ?? 0)),
      width_cm: isDigital ? 0 : Math.max(0, Number(fd.get("width_cm") ?? 0)),
      height_cm: isDigital ? 0 : Math.max(0, Number(fd.get("height_cm") ?? 0)),
      status: String(fd.get("status") ?? "active"),
      photo_urls: photoUrls,
      is_featured: fd.get("is_featured") === "on",
      product_type: productType,
      digital_delivery_url: isDigital ? digitalDeliveryURL.trim() : "",
      digital_file_url: isDigital ? digitalFileURL.trim() : "",
      digital_instructions: isDigital ? digitalInstructions.trim() : "",
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
      showSuccess(isEditing ? "Produk tersimpan" : "Produk baru ditambahkan");
      push("/products");
      refresh();
    } catch (err) {
      showError(err);
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
      showSuccess("Produk dihapus");
      push("/products");
      refresh();
    } catch (err) {
      showError(err);
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Tipe Produk</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Pilih jenis produk. Digital melewati ongkir & alamat pengiriman dan
            otomatis dikirim setelah pembayaran lunas.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              value: "physical" as const,
              icon: Box,
              title: "Fisik",
              desc: "Barang yang dikirim ke alamat pembeli (kaos, makanan, kerajinan, dll.).",
            },
            {
              value: "digital" as const,
              icon: Download,
              title: "Digital",
              desc: "File / akses yang diserahkan via link / kode (ebook, kursus, voucher).",
            },
          ].map((opt) => {
            const active = productType === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setProductType(opt.value)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors",
                  active
                    ? "border-brand-500 bg-brand-50/40"
                    : "border-neutral-200 bg-white hover:border-neutral-300",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md",
                    active ? "bg-brand-100 text-brand-700" : "bg-neutral-100 text-neutral-600",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-neutral-900">{opt.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                    {opt.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

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
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">- Tanpa kategori -</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {categories.length === 0 && (
              <p className="text-xs text-neutral-500">
                Belum ada kategori.{" "}
                <Link
                  href="/settings/categories"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Tambah di Pengaturan
                </Link>
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
            <Label htmlFor="price">Harga (Rp) {hasVariants ? "" : "*"}</Label>
            <Input
              id="price"
              name="price"
              type="number"
              required={!hasVariants}
              disabled={hasVariants}
              min={0}
              step={500}
              defaultValue={initial ? Math.round(initial.price_cents / 100) : ""}
              placeholder={hasVariants ? "Otomatis dari varian" : "35000"}
            />
          </div>
          {!isDigital && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock">Stok {hasVariants ? "" : "*"}</Label>
              <Input
                id="stock"
                name="stock"
                type="number"
                required={!hasVariants}
                disabled={hasVariants}
                min={0}
                defaultValue={initial?.stock ?? 0}
                placeholder={hasVariants ? "Otomatis dari varian" : ""}
              />
            </div>
          )}
          {!isDigital && (
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
          )}
          {isDigital && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Produk digital tidak butuh stok - pembeli langsung dapat akses
                setelah bayar.
              </p>
            </div>
          )}
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

        <label
          htmlFor="is_featured_toggle"
          className="mt-5 flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5"
        >
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
            id="is_featured_toggle"
            name="is_featured"
            defaultChecked={initial?.is_featured ?? false}
          />
        </label>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Foto Produk</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Maks. 5 foto. Upload langsung dari device.
          </p>
        </div>

        {photoUrls.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {photoUrls.map((url, i) => (
              <div
                key={url || `slot-${i}`}
                className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
              >
                <Image
                  src={url}
                  alt={`Foto ${i + 1}`}
                  width={200}
                  height={200}
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

        <PhotoUploader
          disabled={photoUrls.length >= 5}
          onUploaded={(url) =>
            setPhotoUrls((prev) =>
              prev.length >= 5 ? prev : [...prev, url],
            )
          }
        />
      </Card>

      {isDigital && (
        <Card>
          <div className="mb-4">
            <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
              <Download className="size-4 text-brand-600" aria-hidden />
              Pengiriman Digital
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Salah satu (atau lebih) wajib diisi. Pembeli akan lihat semua
              info ini di halaman download setelah pembayaran lunas.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="digital_delivery_url">Link Akses</Label>
              <Input
                id="digital_delivery_url"
                value={digitalDeliveryURL}
                onChange={(e) => setDigitalDeliveryURL(e.target.value)}
                placeholder="https://drive.google.com/... atau https://notion.so/..."
              />
              <p className="text-xs text-neutral-500">
                Link Google Drive, Notion, Dropbox, halaman kursus, dll.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>File Upload (opsional)</Label>
              {digitalFileURL ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                  <a
                    href={digitalFileURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-brand-600 hover:underline"
                  >
                    {digitalFileURL}
                  </a>
                  <button
                    type="button"
                    onClick={() => setDigitalFileURL("")}
                    aria-label="Hapus file"
                    className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-danger"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <PhotoUploader
                  onUploaded={(url) => setDigitalFileURL(url)}
                />
              )}
              <p className="text-xs text-neutral-500">
                Upload langsung ke storage SellOn (PDF, zip, gambar). Maks. ~25MB.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="digital_instructions">Instruksi / Catatan</Label>
              <textarea
                id="digital_instructions"
                rows={4}
                value={digitalInstructions}
                onChange={(e) => setDigitalInstructions(e.target.value)}
                placeholder="Cara redeem kode, password unzip, instruksi akses, dll. Akan tampil di halaman download pembeli."
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>
        </Card>
      )}

      {!isDigital && (
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
          <label
            htmlFor="has_variants_toggle"
            className="flex cursor-pointer items-center gap-3 text-sm"
          >
            <span className="font-medium text-neutral-900">Pakai varian</span>
            <Switch
              id="has_variants_toggle"
              checked={hasVariants}
              onChange={(e) => {
                setHasVariants(e.target.checked);
                if (e.target.checked && variants.length === 0) {
                  setVariants([
                    { id: "", name: "", sku: "", price_cents: 0, stock: 0 },
                  ]);
                }
              }}
            />
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
                key={v.id || `new-${i}`}
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
      )}

      {!isDigital && (
      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Berat & Dimensi</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Dipakai untuk hitung ongkir. Optional - kalau kosong, ongkir
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
      )}

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
            onClick={() => push("/products")}
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

    </form>
  );
}
