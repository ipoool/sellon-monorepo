"use client";

import { useState, type FormEvent } from "react";
import { ShoppingCart, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { formatRupiah } from "@/lib/format";
import { fillTemplate, waLink } from "@/lib/whatsapp";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  product: {
    id: string;
    name: string;
    price_cents: number;
    stock: number;
  };
  isOpen: boolean;
};

const couriers = [
  { value: "jne", label: "JNE Reguler" },
  { value: "jnt", label: "J&T Express" },
  { value: "sicepat", label: "SiCepat REG" },
  { value: "anteraja", label: "AnterAja" },
  { value: "gosend", label: "GoSend Same Day" },
  { value: "grab", label: "GrabExpress" },
];

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
  isOpen,
}: Props) {
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = product.price_cents * qty;
  const outOfStock = product.stock <= 0;
  const disabled = !isOpen || outOfStock;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setPending(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const customerName = String(fd.get("customer_name") ?? "").trim();
    const customerWA = String(fd.get("customer_whatsapp") ?? "").trim();
    const customerAddress = String(fd.get("customer_address") ?? "").trim();
    const customerCity = String(fd.get("customer_city") ?? "").trim();
    const courierValue = String(fd.get("courier") ?? "");
    const paymentMethod = String(fd.get("payment_method") ?? "");
    const notes = String(fd.get("notes") ?? "").trim();

    const courierLabel =
      couriers.find((c) => c.value === courierValue)?.label || "—";
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
          shipping_cents: 0,
          items: [{ product_id: product.id, quantity: qty }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Build WA message and redirect.
      const ringkasan = `${qty}× ${product.name} @ ${formatRupiah(product.price_cents)} = ${formatRupiah(subtotal)}`;
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

      const url = waLink(storeWhatsApp || "", message);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        // Penjual belum set nomor WA — show fallback alert
        alert(
          `Pesanan tercatat (${data.order_number}). Toko belum set WhatsApp — silakan kontak penjual lewat channel lain.`,
        );
      }
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
              disabled={qty >= product.stock || disabled}
              onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
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
              name="customer_city"
              disabled={disabled}
              placeholder="Yogyakarta"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="courier">Kurir</Label>
            <Select id="courier" name="courier" defaultValue="jne" disabled={disabled}>
              {couriers.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
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
        <div className="mt-5 flex items-baseline justify-between border-t border-neutral-200 pt-4">
          <span className="text-sm text-neutral-600">Subtotal</span>
          <span className="font-display text-xl font-semibold text-neutral-900">
            {formatRupiah(subtotal)}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Ongkir akan dikonfirmasi penjual via WhatsApp setelah submit.
        </p>

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
