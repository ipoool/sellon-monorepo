"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Trash2, Save, ArrowLeft, Plus, X, Download, GraduationCap, Video, Star, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MarkdownField } from "@/components/ui/markdown-field";
import { PhotoUploader } from "@/components/dashboard/photo-uploader";
import {
  ProductTypeSelector,
  type ProductTypeValue,
} from "@/components/dashboard/product-type-selector";
import { showError, showSuccess } from "@/lib/toast";
import type { Category, CourseVideo, Product } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type CourseVideoDraft = { title: string; youtube_url: string; description_md: string };

// NonPhysicalProductForm is the dedicated, purpose-built form for digital +
// course products. It deliberately shares NO layout with the physical form —
// no stock, no Barcode/GTIN, no variants/recipe/options/dimensions — so the
// seller only sees fields that apply.
export function NonPhysicalProductForm({
  initial,
  productType,
  onChangeType,
}: {
  initial?: Product;
  productType: "digital" | "course";
  onChangeType: (v: ProductTypeValue) => void;
}) {
  const { push, refresh } = useRouter();
  const isEditing = !!initial;
  const isCourse = productType === "course";

  const [photoUrls, setPhotoUrls] = useState<string[]>(initial?.photo_urls ?? []);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");

  const [digitalDeliveryURL, setDigitalDeliveryURL] = useState<string>(
    initial?.digital_delivery_url ?? "",
  );
  const [digitalFileURL, setDigitalFileURL] = useState<string>(initial?.digital_file_url ?? "");
  const [digitalInstructions, setDigitalInstructions] = useState<string>(
    initial?.digital_instructions ?? "",
  );

  const [courseVideos, setCourseVideos] = useState<CourseVideoDraft[]>(() =>
    (initial?.course_videos ?? []).map((v: CourseVideo) => ({
      title: v.title ?? "",
      youtube_url: v.youtube_url ?? "",
      description_md: v.description_md ?? "",
    })),
  );

  // Course access validity ("masa aktif"). Default seumur hidup (lifetime);
  // the seller can cap it to N weeks/months/years.
  type AccessUnit = "lifetime" | "week" | "month" | "year";
  const [accessUnit, setAccessUnit] = useState<AccessUnit>(
    initial?.access_validity_unit && initial.access_validity_unit !== "lifetime"
      ? initial.access_validity_unit
      : "lifetime",
  );
  const [accessValue, setAccessValue] = useState<number>(
    initial?.access_validity_value && initial.access_validity_value > 0
      ? initial.access_validity_value
      : 1,
  );
  const accessUnitLabel: Record<Exclude<AccessUnit, "lifetime">, string> = {
    week: "minggu",
    month: "bulan",
    year: "tahun",
  };

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/categories`, { credentials: "include" });
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
  function addCourseVideo() {
    setCourseVideos((prev) => [...prev, { title: "", youtube_url: "", description_md: "" }]);
  }
  function removeCourseVideo(idx: number) {
    setCourseVideos((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateCourseVideo(idx: number, patch: Partial<CourseVideoDraft>) {
    setCourseVideos((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }
  function moveCourseVideo(idx: number, dir: -1 | 1) {
    setCourseVideos((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);

    if (productType === "digital") {
      const hasAny =
        digitalDeliveryURL.trim() !== "" ||
        digitalFileURL.trim() !== "" ||
        digitalInstructions.trim() !== "";
      if (!hasAny) {
        showError("Produk digital butuh minimal salah satu: link, file upload, atau instruksi.");
        setPending(false);
        return;
      }
    }

    const cleanCourseVideos = courseVideos
      .map((v) => ({
        title: v.title.trim(),
        youtube_url: v.youtube_url.trim(),
        description_md: v.description_md.trim(),
      }))
      .filter((v) => v.youtube_url !== "");
    if (isCourse && cleanCourseVideos.length === 0) {
      showError("Produk kursus butuh minimal satu video dengan link YouTube.");
      setPending(false);
      return;
    }

    const body = {
      category_id: categoryId,
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      description: String(fd.get("description") ?? ""),
      price_cents: Math.round(Number(fd.get("price") ?? 0)) * 100,
      // Non-physical: no stock, dimensions, variants, takeaway, or barcode.
      stock: 0,
      low_stock_threshold: 0,
      weight_g: 0,
      length_cm: 0,
      width_cm: 0,
      height_cm: 0,
      status: String(fd.get("status") ?? "active"),
      gtin: "",
      takeaway_enabled: false,
      takeaway_charge_cents: 0,
      takeaway_material_id: "",
      photo_urls: photoUrls,
      is_featured: fd.get("is_featured") === "on",
      product_type: productType,
      digital_delivery_url: productType === "digital" ? digitalDeliveryURL.trim() : "",
      digital_file_url: productType === "digital" ? digitalFileURL.trim() : "",
      digital_instructions: productType === "digital" ? digitalInstructions.trim() : "",
      variants: [],
      course_videos: isCourse ? cleanCourseVideos : [],
      // Access validity: only courses set it; lifetime sends value 0.
      access_validity_unit: isCourse ? accessUnit : "lifetime",
      access_validity_value:
        isCourse && accessUnit !== "lifetime" ? Math.max(1, Math.round(accessValue)) : 0,
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

      // On edit, clear any stale physical-only child data (discounts / base
      // recipe / modifiers) so a physical→non-physical conversion leaves none.
      if (isEditing) {
        await fetch(`${apiBase}/api/v1/products/${initial.id}/discounts`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discounts: [] }),
        }).catch(() => {});
        await fetch(`${apiBase}/api/v1/products/${initial.id}/modifiers`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_recipe: [], groups: [] }),
        }).catch(() => {});
      }

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
      <ProductTypeSelector value={productType} onChange={onChangeType} />

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
              placeholder={isCourse ? "Kelas Dasar Fotografi" : "E-book Resep Rahasia"}
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
            <Select id="category_id" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
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
              placeholder="Apa yang didapat pembeli, untuk siapa, dan kenapa worth it."
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Harga</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            {isCourse
              ? "Pembeli dapat akses kelas setelah pembayaran lunas."
              : "Pembeli langsung dapat link/file akses setelah pembayaran lunas."}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
              placeholder="49000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={initial?.status ?? "active"}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
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

      {productType === "digital" && (
        <Card>
          <div className="mb-4">
            <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
              <Download className="size-4 text-brand-600" aria-hidden />
              Pengiriman Digital
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Salah satu (atau lebih) wajib diisi. Pembeli akan lihat semua info
              ini di halaman download setelah pembayaran lunas.
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
                Link Google Drive, Notion, Dropbox, halaman akses, dll.
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
                <PhotoUploader onUploaded={(url) => setDigitalFileURL(url)} />
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

      {isCourse && (
        <Card>
          <div className="mb-4">
            <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
              <GraduationCap className="size-4 text-brand-600" aria-hidden />
              Materi Kursus
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Tambahkan video (link YouTube) + deskripsi tiap sesi. Pembeli yang
              sudah lunas akses lewat halaman khusus dengan login OTP email.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {courseVideos.length === 0 && (
              <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
                Belum ada video. Tambahkan minimal satu video untuk kursus ini.
              </p>
            )}
            {courseVideos.map((v, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
                    <Video className="size-4 text-brand-600" aria-hidden />
                    Video {i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveCourseVideo(i, -1)}
                      title="Naik"
                      className="flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={i === courseVideos.length - 1}
                      onClick={() => moveCourseVideo(i, 1)}
                      title="Turun"
                      className="flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCourseVideo(i)}
                      title="Hapus video"
                      className="flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Judul video (mis. Sesi 1: Pengantar)"
                    value={v.title}
                    onChange={(e) => updateCourseVideo(i, { title: e.target.value })}
                  />
                  <Input
                    placeholder="Link YouTube (https://youtu.be/… atau …/watch?v=…)"
                    value={v.youtube_url}
                    onChange={(e) => updateCourseVideo(i, { youtube_url: e.target.value })}
                  />
                  <div>
                    <Label className="mb-1 block text-xs text-neutral-500">Deskripsi</Label>
                    <MarkdownField
                      value={v.description_md}
                      onChange={(val) => updateCourseVideo(i, { description_md: val })}
                      placeholder="Apa yang dipelajari di video ini…"
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addCourseVideo}>
              <Plus className="size-4" aria-hidden />
              Tambah Video
            </Button>
          </div>
        </Card>
      )}

      {isCourse && (
        <Card>
          <div className="mb-4">
            <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
              <Clock className="size-4 text-brand-600" aria-hidden />
              Masa Aktif Kursus
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Berapa lama pembeli bisa mengakses kursus setelah membeli. Default
              seumur hidup.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <Label className="mb-1 block text-xs text-neutral-500">Durasi akses</Label>
              <Select
                value={accessUnit}
                onChange={(e) => setAccessUnit(e.target.value as AccessUnit)}
              >
                <option value="lifetime">Seumur hidup</option>
                <option value="week">Minggu</option>
                <option value="month">Bulan</option>
                <option value="year">Tahun</option>
              </Select>
            </div>
            {accessUnit !== "lifetime" && (
              <div className="w-28">
                <Label className="mb-1 block text-xs text-neutral-500">Jumlah</Label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={accessValue}
                  onChange={(e) =>
                    setAccessValue(Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))))
                  }
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {accessUnit === "lifetime"
              ? "Akses tidak akan kedaluwarsa."
              : `Akses berlaku ${accessValue} ${accessUnitLabel[accessUnit]} sejak pembelian.`}
          </p>
        </Card>
      )}

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Foto Produk</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Maks. 5 foto / cover. Upload langsung dari device.
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
          onUploaded={(url) => setPhotoUrls((prev) => (prev.length >= 5 ? prev : [...prev, url]))}
        />
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
          <Button type="button" variant="ghost" size="md" onClick={() => push("/products")}>
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
