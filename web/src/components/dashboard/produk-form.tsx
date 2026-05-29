"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Trash2, Save, ArrowLeft, Plus, X, Layers, Star, Box, Download, Info, Boxes } from "lucide-react";

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
import type { Category, Material, Product, ProductDiscount, Variant } from "@/lib/types";

type VariantDraft = {
  id: string; // empty for new
  name: string;
  sku: string;
  price_cents: number;
  stock: number;
};

type DiscountDraft = {
  min_quantity: number;
  discount_type: "percent" | "fixed";
  discount_value: number;
  starts_at: string; // datetime-local format or ""
  ends_at: string;
  is_active: boolean;
};

type RecipeDraft = {
  material_id: string;
  quantity: number;
};

type OptionDraft = {
  name: string;
  price_delta_rupiah: number;
  recipe: RecipeDraft[];
};

type GroupDraft = {
  name: string;
  selection: "single" | "multi";
  is_required: boolean;
  options: OptionDraft[];
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

  // ISO date helper untuk datetime-local input value (drop seconds + tz).
  const isoToLocalInput = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    // YYYY-MM-DDTHH:MM in local tz
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [discounts, setDiscounts] = useState<DiscountDraft[]>(() =>
    (initial?.discounts ?? []).map((d: ProductDiscount) => ({
      min_quantity: d.min_quantity,
      discount_type: d.discount_type,
      discount_value: d.discount_value,
      starts_at: isoToLocalInput(d.starts_at),
      ends_at: isoToLocalInput(d.ends_at),
      is_active: d.is_active,
    })),
  );
  const [materials, setMaterials] = useState<Material[]>([]);
  const [recipe, setRecipe] = useState<RecipeDraft[]>(() =>
    (initial?.base_recipe ?? []).map((r) => ({
      material_id: r.material_id,
      quantity: r.quantity,
    })),
  );
  const [groups, setGroups] = useState<GroupDraft[]>(() =>
    (initial?.modifiers ?? []).map((g) => ({
      name: g.name,
      selection: g.selection,
      is_required: g.is_required,
      options: g.options.map((o) => ({
        name: o.name,
        price_delta_rupiah: Math.floor(o.price_delta_cents / 100),
        recipe: (o.recipe ?? []).map((r) => ({
          material_id: r.material_id,
          quantity: r.quantity,
        })),
      })),
    })),
  );
  const [takeawayEnabled, setTakeawayEnabled] = useState<boolean>(
    initial?.takeaway_enabled ?? false,
  );
  const [takeawayCharge, setTakeawayCharge] = useState<number>(
    initial ? Math.floor((initial.takeaway_charge_cents ?? 0) / 100) : 0,
  );
  const [takeawayMaterialId, setTakeawayMaterialId] = useState<string>(
    initial?.takeaway_material_id ?? "",
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
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/materials?limit=200`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { materials: Material[] };
        setMaterials(data.materials ?? []);
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
      gtin: String(fd.get("gtin") ?? "").trim(),
      takeaway_enabled: takeawayEnabled,
      takeaway_charge_cents: takeawayEnabled
        ? Math.max(0, Math.round(takeawayCharge)) * 100
        : 0,
      takeaway_material_id: takeawayEnabled ? takeawayMaterialId : "",
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

      // Save tier discounts (separate endpoint). Skip jika new product (need id).
      const productId = isEditing ? initial.id : data?.product?.id;
      if (productId) {
        const localToISO = (s: string) => (s ? new Date(s).toISOString() : null);
        await fetch(`${apiBase}/api/v1/products/${productId}/discounts`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discounts: discounts.map((d) => ({
              min_quantity: d.min_quantity,
              discount_type: d.discount_type,
              discount_value: d.discount_value,
              starts_at: localToISO(d.starts_at),
              ends_at: localToISO(d.ends_at),
              is_active: d.is_active,
            })),
          }),
        }).catch(() => {});

        // Save base recipe (material consumption) — separate endpoint.
        await fetch(`${apiBase}/api/v1/products/${productId}/modifiers`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_recipe: recipe
              .filter((r) => r.material_id && r.quantity > 0)
              .map((r) => ({ material_id: r.material_id, quantity: r.quantity })),
            groups: groups
              .filter(
                (g) =>
                  g.name.trim() && g.options.some((o) => o.name.trim()),
              )
              .map((g) => ({
                name: g.name.trim(),
                selection: g.selection,
                is_required: g.is_required,
                options: g.options
                  .filter((o) => o.name.trim())
                  .map((o) => ({
                    name: o.name.trim(),
                    price_delta_cents:
                      Math.max(0, Math.round(o.price_delta_rupiah || 0)) * 100,
                    recipe: o.recipe
                      .filter((r) => r.material_id && r.quantity > 0)
                      .map((r) => ({
                        material_id: r.material_id,
                        quantity: r.quantity,
                      })),
                  })),
              })),
          }),
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
            <div className="flex items-center gap-1.5">
              <Label htmlFor="price">Harga (Rp) {hasVariants ? "" : "*"}</Label>
              <span className="group relative inline-flex">
                <Info
                  className="size-3.5 cursor-help text-neutral-400 hover:text-neutral-600"
                  aria-hidden
                />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg bg-neutral-900 px-3 py-2.5 text-xs leading-relaxed text-white opacity-0 shadow-popout transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <p className="font-semibold text-white">Pastikan harga sudah di atas HPP + margin</p>
                  <p className="mt-1 text-neutral-200">
                    Harga jual = HPP (bahan baku, kemasan, tenaga kerja) + margin keuntungan kamu.
                  </p>
                  <p className="mt-1 text-neutral-200">
                    Kalau kamu aktifkan program reseller, harga ini juga jadi acuan diskon ke reseller — pastikan masih punya ruang margin.
                  </p>
                </span>
              </span>
            </div>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gtin">Barcode / GTIN</Label>
            <Input
              id="gtin"
              name="gtin"
              inputMode="numeric"
              defaultValue={initial?.gtin ?? ""}
              placeholder="Mis. 8991002123455"
            />
            <p className="text-xs text-neutral-500">
              Global Trade Item Number (EAN/UPC), 8–14 digit. Opsional.
            </p>
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
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-900">Potongan Volume</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Otomatis kasih diskon saat pembeli beli minimal qty tertentu. Bisa di-set masa berlaku.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setDiscounts([
                ...discounts,
                {
                  min_quantity: 2,
                  discount_type: "percent",
                  discount_value: 5,
                  starts_at: "",
                  ends_at: "",
                  is_active: true,
                },
              ])
            }
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Plus className="size-3.5" aria-hidden />
            Tambah Tier
          </button>
        </div>

        {discounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 py-6 text-center text-sm text-neutral-500">
            Belum ada potongan volume. Klik "Tambah Tier" untuk mulai.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {discounts.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-3",
                  d.is_active ? "border-neutral-200 bg-white" : "border-neutral-200 bg-neutral-50 opacity-70",
                )}
              >
                <div className="grid gap-2 sm:grid-cols-[110px_120px_1fr_auto]">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-neutral-600">Min. Qty</label>
                    <Input
                      type="number"
                      min={1}
                      value={d.min_quantity || ""}
                      onChange={(e) =>
                        setDiscounts(
                          discounts.map((x, j) =>
                            j === i ? { ...x, min_quantity: parseInt(e.target.value, 10) || 1 } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-neutral-600">Tipe</label>
                    <Select
                      value={d.discount_type}
                      onChange={(e) =>
                        setDiscounts(
                          discounts.map((x, j) =>
                            j === i
                              ? { ...x, discount_type: e.target.value as "percent" | "fixed" }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="percent">Persen %</option>
                      <option value="fixed">Nominal Rp</option>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-neutral-600">
                      Nilai {d.discount_type === "percent" ? "(%)" : "(Rp)"}
                    </label>
                    {d.discount_type === "percent" ? (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={d.discount_value || ""}
                        onChange={(e) =>
                          setDiscounts(
                            discounts.map((x, j) =>
                              j === i ? { ...x, discount_value: Math.min(100, parseInt(e.target.value, 10) || 0) } : x,
                            ),
                          )
                        }
                      />
                    ) : (
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">Rp</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={d.discount_value > 0 ? Math.floor(d.discount_value / 100).toLocaleString("id-ID") : ""}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            const rupiah = digits === "" ? 0 : parseInt(digits, 10);
                            setDiscounts(
                              discounts.map((x, j) => (j === i ? { ...x, discount_value: rupiah * 100 } : x)),
                            );
                          }}
                          className="pl-10 text-right"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-end gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDiscounts(
                          discounts.map((x, j) => (j === i ? { ...x, is_active: !x.is_active } : x)),
                        )
                      }
                      className={cn(
                        "h-10 rounded-md border px-2.5 text-xs font-medium transition-colors",
                        d.is_active
                          ? "border-brand-200 bg-brand-50 text-brand-700"
                          : "border-neutral-200 bg-white text-neutral-500",
                      )}
                    >
                      {d.is_active ? "Aktif" : "Off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscounts(discounts.filter((_, j) => j !== i))}
                      className="flex size-10 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-neutral-600">
                      Mulai <span className="text-neutral-400">(opsional)</span>
                    </label>
                    <Input
                      type="datetime-local"
                      value={d.starts_at}
                      onChange={(e) =>
                        setDiscounts(
                          discounts.map((x, j) => (j === i ? { ...x, starts_at: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-neutral-600">
                      Sampai <span className="text-neutral-400">(opsional)</span>
                    </label>
                    <Input
                      type="datetime-local"
                      value={d.ends_at}
                      onChange={(e) =>
                        setDiscounts(
                          discounts.map((x, j) => (j === i ? { ...x, ends_at: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Resep Dasar Produk — bahan yang terpakai tiap 1 produk terjual */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Boxes className="size-4 text-brand-600" aria-hidden />
          <div>
            <h2 className="font-semibold text-neutral-900">Resep Dasar Produk</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Bahan yang otomatis terpakai (dan stoknya berkurang) tiap 1 produk
              ini terjual — di POS maupun toko online.
            </p>
          </div>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-center text-sm text-neutral-500">
            Belum ada bahan baku.{" "}
            <Link href="/materials" className="font-medium text-brand-700 hover:underline">
              Tambah bahan dulu
            </Link>{" "}
            untuk bisa pasang resep.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recipe.map((row, i) => {
              const mat = materials.find((m) => m.id === row.material_id);
              return (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={row.material_id}
                    onChange={(e) =>
                      setRecipe(
                        recipe.map((x, j) =>
                          j === i ? { ...x, material_id: e.target.value } : x,
                        ),
                      )
                    }
                    className="flex-1"
                  >
                    <option value="">— pilih bahan —</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.base_unit})
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity || ""}
                    onChange={(e) =>
                      setRecipe(
                        recipe.map((x, j) =>
                          j === i
                            ? { ...x, quantity: parseInt(e.target.value, 10) || 0 }
                            : x,
                        ),
                      )
                    }
                    placeholder="Qty"
                    className="w-24 text-right"
                  />
                  <span className="w-10 shrink-0 text-xs text-neutral-400">
                    {mat?.base_unit ?? ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecipe(recipe.filter((_, j) => j !== i))}
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                    aria-label="Hapus bahan"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              );
            })}
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setRecipe([...recipe, { material_id: "", quantity: 1 }])
                }
              >
                <Plus className="size-4" aria-hidden />
                Tambah Bahan
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Penyajian — Dine In / Take Away (POS only) */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Box className="size-4 text-brand-600" aria-hidden />
          <div>
            <h2 className="font-semibold text-neutral-900">
              Penyajian (Dine In / Take Away)
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Saat aktif, kasir diminta pilih Dine In / Take Away ketika produk
              ini di-tap. Take Away menambah baris charge kemasan yang ditagih
              ke pembeli.
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              Aktifkan pilihan Dine In / Take Away
            </p>
            <p className="text-xs text-neutral-600">
              Hanya untuk produk yang perlu kemasan saat dibawa pulang.
            </p>
          </div>
          <Switch
            checked={takeawayEnabled}
            onChange={(e) => setTakeawayEnabled(e.target.checked)}
          />
        </label>

        {takeawayEnabled && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="takeaway_charge">Charge kemasan / porsi (Rp)</Label>
              <Input
                id="takeaway_charge"
                inputMode="numeric"
                value={takeawayCharge ? takeawayCharge.toLocaleString("id-ID") : ""}
                onChange={(e) =>
                  setTakeawayCharge(
                    parseInt(e.target.value.replace(/\D/g, ""), 10) || 0,
                  )
                }
                placeholder="1000"
              />
              <p className="text-xs text-neutral-500">
                Ditagih ke pembeli sebagai baris terpisah di struk.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="takeaway_material">Bahan yang dipotong</Label>
              <Select
                id="takeaway_material"
                value={takeawayMaterialId}
                onChange={(e) => setTakeawayMaterialId(e.target.value)}
              >
                <option value="">— tidak potong stok —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.base_unit})
                  </option>
                ))}
              </Select>
              <p className="text-xs text-neutral-500">
                1 dipotong tiap porsi take away + masuk laporan konsumsi.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Opsi Produk — grup pilihan (ukuran, kemasan, add-on) dengan harga */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Layers className="size-4 text-brand-600" aria-hidden />
          <div>
            <h2 className="font-semibold text-neutral-900">Opsi Produk</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Pilihan yang ditawarkan ke pembeli (Ukuran, Kemasan, Topping…).
              Tiap opsi bisa menambah harga jual.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {groups.map((g, gi) => (
            <div
              key={gi}
              className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={g.name}
                  onChange={(e) =>
                    setGroups(
                      groups.map((x, j) =>
                        j === gi ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Nama grup (mis. Ukuran)"
                  className="min-w-0 flex-1"
                />
                <Select
                  value={g.selection}
                  onChange={(e) =>
                    setGroups(
                      groups.map((x, j) =>
                        j === gi
                          ? { ...x, selection: e.target.value as GroupDraft["selection"] }
                          : x,
                      ),
                    )
                  }
                  className="h-9 w-32"
                >
                  <option value="single">Pilih 1</option>
                  <option value="multi">Pilih banyak</option>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <Switch
                    size="sm"
                    checked={g.is_required}
                    onChange={(e) =>
                      setGroups(
                        groups.map((x, j) =>
                          j === gi ? { ...x, is_required: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  Wajib
                </label>
                <button
                  type="button"
                  onClick={() => setGroups(groups.filter((_, j) => j !== gi))}
                  className="flex size-9 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                  aria-label="Hapus grup"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3">
                {g.options.map((o, oi) => (
                  <div key={oi} className="flex flex-col gap-1.5 rounded-md border border-neutral-200 bg-white p-2">
                   <div className="flex items-center gap-2">
                    <Input
                      value={o.name}
                      onChange={(e) =>
                        setGroups(
                          groups.map((x, j) =>
                            j === gi
                              ? {
                                  ...x,
                                  options: x.options.map((y, k) =>
                                    k === oi ? { ...y, name: e.target.value } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Nama opsi (mis. Large)"
                      className="min-w-0 flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-neutral-400">+Rp</span>
                      <Input
                        inputMode="numeric"
                        value={
                          o.price_delta_rupiah
                            ? o.price_delta_rupiah.toLocaleString("id-ID")
                            : ""
                        }
                        onChange={(e) =>
                          setGroups(
                            groups.map((x, j) =>
                              j === gi
                                ? {
                                    ...x,
                                    options: x.options.map((y, k) =>
                                      k === oi
                                        ? {
                                            ...y,
                                            price_delta_rupiah:
                                              parseInt(
                                                e.target.value.replace(/\D/g, ""),
                                                10,
                                              ) || 0,
                                          }
                                        : y,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                        placeholder="0"
                        className="w-24 text-right"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setGroups(
                          groups.map((x, j) =>
                            j === gi
                              ? { ...x, options: x.options.filter((_, k) => k !== oi) }
                              : x,
                          ),
                        )
                      }
                      className="flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                      aria-label="Hapus opsi"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                   </div>

                   {/* Per-option recipe: materials consumed when chosen */}
                   {materials.length > 0 && (
                     <div className="flex flex-col gap-1.5 border-t border-neutral-100 pt-1.5 pl-1">
                       {o.recipe.map((r, ri) => {
                         const mat = materials.find((m) => m.id === r.material_id);
                         return (
                           <div key={ri} className="flex items-center gap-2">
                             <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                               pakai
                             </span>
                             <Select
                               value={r.material_id}
                               onChange={(e) =>
                                 setGroups(
                                   groups.map((x, j) =>
                                     j === gi
                                       ? {
                                           ...x,
                                           options: x.options.map((y, k) =>
                                             k === oi
                                               ? {
                                                   ...y,
                                                   recipe: y.recipe.map((z, m) =>
                                                     m === ri
                                                       ? { ...z, material_id: e.target.value }
                                                       : z,
                                                   ),
                                                 }
                                               : y,
                                           ),
                                         }
                                       : x,
                                   ),
                                 )
                               }
                               className="h-8 min-w-0 flex-1 text-xs"
                             >
                               <option value="">— bahan —</option>
                               {materials.map((m) => (
                                 <option key={m.id} value={m.id}>
                                   {m.name} ({m.base_unit})
                                 </option>
                               ))}
                             </Select>
                             <Input
                               type="number"
                               min={1}
                               value={r.quantity || ""}
                               onChange={(e) =>
                                 setGroups(
                                   groups.map((x, j) =>
                                     j === gi
                                       ? {
                                           ...x,
                                           options: x.options.map((y, k) =>
                                             k === oi
                                               ? {
                                                   ...y,
                                                   recipe: y.recipe.map((z, m) =>
                                                     m === ri
                                                       ? {
                                                           ...z,
                                                           quantity:
                                                             parseInt(e.target.value, 10) || 0,
                                                         }
                                                       : z,
                                                   ),
                                                 }
                                               : y,
                                           ),
                                         }
                                       : x,
                                   ),
                                 )
                               }
                               placeholder="Qty"
                               className="h-8 w-20 text-right text-xs"
                             />
                             <span className="w-8 shrink-0 text-[10px] text-neutral-400">
                               {mat?.base_unit ?? ""}
                             </span>
                             <button
                               type="button"
                               onClick={() =>
                                 setGroups(
                                   groups.map((x, j) =>
                                     j === gi
                                       ? {
                                           ...x,
                                           options: x.options.map((y, k) =>
                                             k === oi
                                               ? { ...y, recipe: y.recipe.filter((_, m) => m !== ri) }
                                               : y,
                                           ),
                                         }
                                       : x,
                                   ),
                                 )
                               }
                               className="flex size-7 shrink-0 items-center justify-center rounded text-neutral-300 hover:text-danger"
                               aria-label="Hapus bahan opsi"
                             >
                               <X className="size-3.5" aria-hidden />
                             </button>
                           </div>
                         );
                       })}
                       <button
                         type="button"
                         onClick={() =>
                           setGroups(
                             groups.map((x, j) =>
                               j === gi
                                 ? {
                                     ...x,
                                     options: x.options.map((y, k) =>
                                       k === oi
                                         ? { ...y, recipe: [...y.recipe, { material_id: "", quantity: 1 }] }
                                         : y,
                                     ),
                                   }
                                 : x,
                             ),
                           )
                         }
                         className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
                       >
                         <Plus className="size-3" aria-hidden />
                         Pakai bahan saat opsi ini dipilih
                       </button>
                     </div>
                   )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setGroups(
                      groups.map((x, j) =>
                        j === gi
                          ? {
                              ...x,
                              options: [
                                ...x.options,
                                { name: "", price_delta_rupiah: 0, recipe: [] },
                              ],
                            }
                          : x,
                      ),
                    )
                  }
                  className="ml-2 inline-flex w-fit items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Tambah Opsi
                </button>
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setGroups([
                  ...groups,
                  {
                    name: "",
                    selection: "single",
                    is_required: false,
                    options: [{ name: "", price_delta_rupiah: 0, recipe: [] }],
                  },
                ])
              }
            >
              <Plus className="size-4" aria-hidden />
              Tambah Grup Opsi
            </Button>
          </div>
        </div>
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
