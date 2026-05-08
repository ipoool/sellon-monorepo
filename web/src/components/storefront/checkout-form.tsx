"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, MessageCircle, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import { fillTemplate, waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type StorefrontVariant = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
};

type Props = {
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  product: {
    id: string;
    name: string;
    price_cents: number;
    stock: number;
    has_variants: boolean;
  };
  variants?: StorefrontVariant[];
  isOpen: boolean;
};

type ShippingOption = {
  courier: string;
  code: string;
  service: string;
  price_rpah: number;
  eta: string;
  zone: string;
};

const paymentMethods = [
  { value: "qris", label: "QRIS / Virtual Account" },
  { value: "transfer", label: "Transfer Bank Manual" },
  { value: "cod", label: "Bayar di Tempat (COD)" },
];

const orderTemplate = `Halo {nama_toko}, saya mau order:

{ringkasan_produk}

Atas nama: {nama_pembeli}
Alamat: {alamat}
Kota: {kota}
Kurir: {kurir}
Pembayaran: {metode_bayar}

No. Pesanan: {nomor_pesanan}
Total: {total}

{catatan_pembeli}`;

export function CheckoutForm({
  storeSlug,
  storeName,
  storeWhatsApp,
  product,
  variants = [],
  isOpen,
}: Props) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<string>("");
  const [city, setCity] = useState("");
  const [shipping, setShipping] = useState<ShippingOption[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [pickedShipping, setPickedShipping] = useState<string>(""); // "code|service"
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVariant = product.has_variants
    ? variants.find((v) => v.id === variantId) ?? null
    : null;

  const unitPriceCents = selectedVariant
    ? selectedVariant.price_cents
    : product.price_cents;
  const availableStock = product.has_variants
    ? selectedVariant?.stock ?? 0
    : product.stock;
  const subtotal = unitPriceCents * qty;
  const outOfStock = product.has_variants
    ? variants.every((v) => v.stock <= 0)
    : product.stock <= 0;
  const variantNotPicked = product.has_variants && !selectedVariant;
  const disabled = !isOpen || outOfStock || variantNotPicked;

  // Reset qty to 1 whenever the buyer switches variant (and clamp to stock).
  useEffect(() => {
    setQty(1);
  }, [variantId]);

  // Fetch shipping options when city is provided + qty/variant changes
  useEffect(() => {
    const trimmed = city.trim();
    if (trimmed.length < 3) {
      setShipping([]);
      setPickedShipping("");
      return;
    }
    const ctrl = new AbortController();
    setShippingLoading(true);
    const t = setTimeout(() => {
      void fetch(`${apiBase}/api/v1/storefront/${storeSlug}/shipping/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: trimmed,
          items: [{ product_id: product.id, quantity: qty }],
        }),
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => {
          setShipping((d.options as ShippingOption[]) || []);
        })
        .catch(() => {
          // ignore
        })
        .finally(() => setShippingLoading(false));
    }, 350); // debounce
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [city, qty, variantId, product.id, storeSlug]);

  const pickedOption = shipping.find(
    (o) => `${o.code}|${o.service}` === pickedShipping,
  );
  const shippingCents = pickedOption ? pickedOption.price_rpah * 100 : 0;
  const grandTotal = subtotal + shippingCents;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setPending(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const customerName = String(fd.get("customer_name") ?? "").trim();
    const customerWA = String(fd.get("customer_whatsapp") ?? "").trim();
    const customerAddress = String(fd.get("customer_address") ?? "").trim();
    const customerCity = city.trim();
    const paymentMethod = String(fd.get("payment_method") ?? "");
    const notes = String(fd.get("notes") ?? "").trim();

    const courierLabel = pickedOption
      ? `${pickedOption.courier} ${pickedOption.service}`
      : "—";
    const paymentLabel =
      paymentMethods.find((p) => p.value === paymentMethod)?.label || "—";

    try {
      const res = await fetch(`${apiBase}/api/v1/storefront/${storeSlug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName,
          customer_whatsapp: customerWA,
          customer_address: customerAddress,
          customer_city: customerCity,
          courier: courierLabel,
          payment_method: paymentLabel,
          notes,
          shipping_cents: shippingCents,
          items: [
            {
              product_id: product.id,
              variant_id: variantId || undefined,
              quantity: qty,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Build WA message and redirect.
      const itemLabel = selectedVariant
        ? `${product.name} (${selectedVariant.name})`
        : product.name;
      const ringkasan = `${qty}× ${itemLabel} @ ${formatRupiah(unitPriceCents)} = ${formatRupiah(subtotal)}`;
      const message = fillTemplate(orderTemplate, {
        nama_toko: storeName,
        nama_pembeli: customerName,
        alamat: customerAddress || "—",
        kota: customerCity || "—",
        kurir: courierLabel,
        metode_bayar: paymentLabel,
        nomor_pesanan: data.order_number || "",
        total: formatRupiah(data.total_cents ?? subtotal),
        ringkasan_produk: ringkasan,
        catatan_pembeli: notes ? `Catatan: ${notes}` : "",
      });

      // Open WhatsApp in a new tab so seller gets the notification
      const url = waLink(storeWhatsApp || "", message);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      // Redirect buyer to the order/payment page (in this tab)
      router.push(`/${storeSlug}/pesanan/${data.order_number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pesanan");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Pesan Sekarang</h2>
        </div>

        {/* Variant picker */}
        {product.has_variants && variants.length > 0 && (
          <div className="mt-5 flex flex-col gap-2">
            <Label htmlFor="variant_id">
              Pilih Varian{" "}
              <span className="text-danger">*</span>
            </Label>
            <Select
              id="variant_id"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              disabled={!isOpen}
            >
              <option value="">— Pilih varian —</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                  {v.name} — {formatRupiah(v.price_cents)}
                  {v.stock <= 0 ? " (habis)" : ` · stok ${v.stock}`}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Quantity */}
        <div className="mt-5 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <span className="text-sm font-medium text-neutral-700">Jumlah</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={qty <= 1 || disabled}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex size-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-lg leading-none text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              aria-label="Kurangi"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold text-neutral-900">
              {qty}
            </span>
            <button
              type="button"
              disabled={qty >= availableStock || disabled}
              onClick={() => setQty((q) => Math.min(availableStock, q + 1))}
              className="flex size-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-lg leading-none text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              aria-label="Tambah"
            >
              +
            </button>
          </div>
        </div>

        {/* Customer info */}
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer_name">Nama Lengkap *</Label>
            <Input
              id="customer_name"
              name="customer_name"
              required
              placeholder="Bu Sari"
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer_whatsapp">Nomor WhatsApp *</Label>
            <Input
              id="customer_whatsapp"
              name="customer_whatsapp"
              type="tel"
              required
              placeholder="0812-3456-7890"
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer_address">Alamat Pengiriman</Label>
            <textarea
              id="customer_address"
              name="customer_address"
              rows={2}
              disabled={disabled}
              placeholder="Jalan, RT/RW, kelurahan, kecamatan…"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer_city">Kota / Kabupaten</Label>
            <Input
              id="customer_city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={disabled}
              placeholder="Yogyakarta"
            />
            <p className="text-xs text-neutral-500">
              Ongkir akan dihitung otomatis berdasarkan kota.
            </p>
          </div>

          {/* Shipping picker */}
          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-1.5">
              <Truck className="size-3.5 text-neutral-500" aria-hidden />
              Kurir & Ongkir
            </Label>
            {city.trim().length < 3 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500">
                Isi kota/kabupaten dulu untuk lihat opsi kurir.
              </p>
            ) : shippingLoading ? (
              <p className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-xs text-neutral-500">
                Menghitung ongkir…
              </p>
            ) : shipping.length === 0 ? (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-neutral-700">
                Belum ada opsi kurir untuk kota ini. Bisa lanjut tanpa pilih kurir; ongkir akan dikonfirmasi penjual via WhatsApp.
              </p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1.5">
                {shipping.map((o) => {
                  const key = `${o.code}|${o.service}`;
                  const active = pickedShipping === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setPickedShipping(key)}
                        disabled={disabled}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-md border p-2.5 text-left transition-colors",
                          active
                            ? "border-brand-500 bg-brand-50/40"
                            : "border-neutral-200 hover:bg-neutral-50",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900">
                            {o.courier}{" "}
                            <span className="text-neutral-500">{o.service}</span>
                          </p>
                          <p className="text-xs text-neutral-500">
                            Estimasi {o.eta}
                          </p>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-display text-sm font-semibold text-neutral-900">
                            {formatRupiah(o.price_rpah * 100)}
                          </span>
                          {active && (
                            <Badge variant="brand" className="mt-0.5">
                              Dipilih
                            </Badge>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment_method">Metode Pembayaran</Label>
            <Select
              id="payment_method"
              name="payment_method"
              defaultValue="qris"
              disabled={disabled}
            >
              {paymentMethods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan (opsional)</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              disabled={disabled}
              placeholder="Misal: minta dibungkus rapi, atau jadwal pengiriman tertentu"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Total */}
        <dl className="mt-5 flex flex-col gap-1.5 border-t border-neutral-200 pt-4 text-sm">
          <div className="flex justify-between text-neutral-600">
            <dt>Subtotal</dt>
            <dd>{formatRupiah(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-neutral-600">
            <dt>Ongkir</dt>
            <dd>
              {pickedOption ? formatRupiah(shippingCents) : (
                <span className="text-neutral-400">— belum dipilih</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 font-display text-xl font-semibold text-neutral-900">
            <dt>Total</dt>
            <dd>{formatRupiah(grandTotal)}</dd>
          </div>
        </dl>

        <Button
          type="submit"
          size="lg"
          className="mt-5 w-full"
          disabled={disabled || pending}
        >
          <MessageCircle className="size-4" aria-hidden />
          {pending
            ? "Memproses…"
            : outOfStock
              ? "Stok Habis"
              : !isOpen
                ? "Toko Sedang Tutup"
                : variantNotPicked
                  ? "Pilih Varian Dulu"
                  : "Pesan via WhatsApp"}
        </Button>

        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}

        <p className="mt-4 text-center text-xs text-neutral-500">
          Setelah submit, kamu akan diarahkan ke WhatsApp dengan pesan otomatis
          berisi detail pesananmu.
        </p>
      </Card>
    </form>
  );
}
