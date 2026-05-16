"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { showError, showSuccess } from "@/lib/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Truck,
  CreditCard,
  Check,
  ArrowLeft,
  ArrowRight,
  Tag,
  X,
  ShoppingCart,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CityPicker } from "@/components/dashboard/city-picker";
import { formatRupiah } from "@/lib/format";
import { fillTemplate, waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-context";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type StorefrontPayment = {
  has_midtrans: boolean;
  midtrans_methods: string[];
  has_manual_bank: boolean;
  has_qris_static: boolean;
  bank_count: number;
};

type ShippingOption = {
  courier: string;
  code: string;
  service: string;
  price_rpah: number;
  eta: string;
  zone: string;
};

type AppliedPromo = {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  discount_cents: number;
  free_shipping: boolean;
};

type PaymentOption = { value: string; label: string };

// Indonesian WhatsApp / mobile-number format. Accepts:
//   "08xx-xxx-xxxx", "0812 3456 7890", "+62 812-3456-7890", "62812345…"
// Strips dashes/spaces/dots/parens, then checks the digits-only form
// against /^(?:\+?62|0)8\d{7,12}$/. Total 10-14 digits after the prefix
// covers Indonesian mobile prefixes (0811-0859 etc.).
const waDigitsRe = /^(?:\+?62|0)8\d{7,12}$/;
function isValidWA(input: string): boolean {
  const cleaned = input.replace(/[\s\-().]/g, "");
  return waDigitsRe.test(cleaned);
}

// RFC-5322-lite — good enough for client-side feedback. Server still
// validates authoritatively.
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(input: string): boolean {
  return emailRe.test(input.trim());
}

function buildPaymentOptions(payment: StorefrontPayment): PaymentOption[] {
  const out: PaymentOption[] = [];
  // Single unified Midtrans Snap option — method selection handled by Snap itself.
  if (payment?.has_midtrans) {
    out.push({ value: "midtrans_snap", label: "Pembayaran Otomatis" });
  }
  if (payment?.has_manual_bank) {
    out.push({ value: "transfer", label: "Transfer Manual" });
  }
  if (payment?.has_qris_static) {
    out.push({ value: "qris_statis", label: "QRIS Statis" });
  }
  if (out.length === 0) {
    out.push({ value: "wa_konfirmasi", label: "Konfirmasi via WhatsApp" });
  }
  return out;
}

const orderTemplate = `Halo {nama_toko}!
Saya {nama_pembeli} mau pesan:

{ringkasan_produk}

Total: {total}
Bayar: {metode_bayar}
Kurir: {kurir}

Alamat:
{alamat}, {kota}

Nomor pesanan: #{nomor_pesanan}
{catatan_pembeli}`;

type Props = {
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  storeOpen: boolean;
  acceptingOrders: boolean;
  acceptingOrdersReason: "" | "store_closed" | "order_limit";
  payment: StorefrontPayment;
};

type Step = 1 | 2 | 3;

export function CheckoutWizard({
  storeSlug,
  storeName,
  storeWhatsApp,
  storeOpen,
  acceptingOrders,
  acceptingOrdersReason,
  payment,
}: Props) {
  const { push, replace } = useRouter();
  const { items, subtotal, isAllDigital, hasDigital, isHydrated, clear } = useCart();
  const paymentMethods = buildPaymentOptions(payment);

  // Prevent redirect-to-cart race: when submit() calls clear() then push(),
  // the empty-cart useEffect would fire before the push completes. This ref
  // marks "order placed — skip the empty-cart redirect".
  const orderPlacedRef = useRef(false);

  // Cart-empty guard. Cart context exposes isHydrated so we know when
  // localStorage has been read; before that, items is the empty default
  // and a redirect would flash on every fresh visit.
  useEffect(() => {
    if (isHydrated && items.length === 0 && !orderPlacedRef.current) {
      replace(`/${storeSlug}/cart`);
    }
  }, [isHydrated, items.length, replace, storeSlug]);

  const [step, setStep] = useState<Step>(1);
  const [customerName, setCustomerName] = useState("");
  const [customerWA, setCustomerWA] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [city, setCity] = useState("");
  const [cityID, setCityID] = useState("");

  const [shipping, setShipping] = useState<ShippingOption[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [pickedShipping, setPickedShipping] = useState<string>("");

  const [paymentMethod, setPaymentMethod] = useState<string>(
    paymentMethods[0]?.value ?? "wa_konfirmasi",
  );
  const [notes, setNotes] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const skipShippingStep = isAllDigital;

  // Fetch shipping options whenever cart + city change. Quote endpoint
  // takes the items array verbatim so multi-product carts get a real
  // total, not just one product's quote.
  useEffect(() => {
    if (skipShippingStep) {
      setShipping([]);
      setPickedShipping("");
      return;
    }
    const trimmed = city.trim();
    if (trimmed.length < 3 || items.length === 0) {
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
          city_id: cityID,
          items: items.reduce<Array<{ product_id: string; quantity: number }>>(
            (acc, it) => {
              if (it.product_type === "physical") {
                acc.push({ product_id: it.product_id, quantity: it.qty });
              }
              return acc;
            },
            [],
          ),
        }),
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => setShipping((d.options as ShippingOption[]) || []))
        .catch(() => {})
        .finally(() => setShippingLoading(false));
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [city, cityID, items, storeSlug, skipShippingStep]);

  const pickedOption = shipping.find(
    (o) => `${o.code}|${o.service}` === pickedShipping,
  );
  const baseShippingCents = pickedOption ? pickedOption.price_rpah * 100 : 0;
  const shippingCents = skipShippingStep
    ? 0
    : appliedPromo?.free_shipping
      ? 0
      : baseShippingCents;
  const discountCents = appliedPromo?.discount_cents ?? 0;
  const grandTotal = Math.max(0, subtotal - discountCents) + shippingCents;

  // Re-validate applied promo whenever subtotal/shipping changes.
  useEffect(() => {
    if (!appliedPromo) return;
    const ctrl = new AbortController();
    void fetch(`${apiBase}/api/v1/storefront/${storeSlug}/promos/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: appliedPromo.code,
        subtotal_cents: subtotal,
        shipping_cents: baseShippingCents,
      }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setAppliedPromo({
          code: appliedPromo.code,
          type: d.type,
          discount_cents: d.discount_cents ?? 0,
          free_shipping: !!d.free_shipping,
        });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [subtotal, baseShippingCents, appliedPromo, storeSlug]);

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/storefront/${storeSlug}/promos/validate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            subtotal_cents: subtotal,
            shipping_cents: baseShippingCents,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Promo tidak valid");
      setAppliedPromo({
        code,
        type: data.type,
        discount_cents: data.discount_cents ?? 0,
        free_shipping: !!data.free_shipping,
      });
      setPromoInput("");
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : "Gagal validasi");
    } finally {
      setPromoLoading(false);
    }
  }

  function clearPromo() {
    setAppliedPromo(null);
    setPromoError(null);
  }

  // Per-step guard. Returns an error string if the step's required
  // fields aren't satisfied; null when good to advance.
  function blockReason(forStep: Step): string | null {
    if (forStep >= 1) {
      if (!customerName.trim()) return "Nama wajib diisi";
      if (!customerWA.trim()) return "Nomor WhatsApp wajib diisi";
      if (!isValidWA(customerWA))
        return "Nomor WhatsApp tidak valid (mis. 0812-3456-7890 atau +62 812 3456 7890)";
      if (hasDigital && !customerEmail.trim())
        return "Email wajib diisi untuk produk digital";
      // Email is optional for non-digital orders, but if the buyer typed
      // anything it should still be a valid address.
      if (customerEmail.trim() && !isValidEmail(customerEmail))
        return "Format email tidak valid";
    }
    if (forStep >= 2 && !skipShippingStep) {
      if (!customerAddress.trim()) return "Alamat pengiriman wajib diisi";
      if (!city.trim()) return "Kota tujuan wajib diisi";
    }
    return null;
  }

  function next() {
    const reason = blockReason(step);
    if (reason) {
      showError(reason);
      return;
    }
    if (step === 1 && skipShippingStep) {
      setStep(3);
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }

  function back() {
    if (step === 3 && skipShippingStep) {
      setStep(1);
      return;
    }
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function submit() {
    const finalCheck = blockReason(3);
    if (finalCheck) {
      showError(finalCheck);
      return;
    }
    if (items.length === 0) {
      showError("Keranjang kosong");
      return;
    }

    setSubmitting(true);
    const courierLabel = skipShippingStep
      ? "Digital — kirim via link"
      : pickedOption
        ? `${pickedOption.courier} ${pickedOption.service}`
        : "—";
    const paymentLabel =
      paymentMethods.find((p) => p.value === paymentMethod)?.label || "—";

    try {
      const res = await fetch(`${apiBase}/api/v1/storefront/${storeSlug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_whatsapp: customerWA.trim(),
          customer_email: customerEmail.trim(),
          customer_address: skipShippingStep ? "" : customerAddress.trim(),
          customer_city: skipShippingStep ? "" : city.trim(),
          courier: courierLabel,
          payment_method: paymentLabel,
          notes: notes.trim(),
          shipping_cents: shippingCents,
          promo_code: appliedPromo?.code ?? "",
          items: items.map((it) => ({
            product_id: it.product_id,
            variant_id: it.variant_id || undefined,
            quantity: it.qty,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Compose a friendly WA message summarising the order. Open WA
      // for the seller but send the buyer to the per-order page in this
      // tab so they can see status + payment instructions.
      const ringkasan = items
        .map((it) => {
          const name = it.variant_name
            ? `${it.product_name} (${it.variant_name})`
            : it.product_name;
          return `${it.qty}× ${name} @ ${formatRupiah(it.unit_price_cents)} = ${formatRupiah(it.unit_price_cents * it.qty)}`;
        })
        .join("\n");
      const message = fillTemplate(orderTemplate, {
        nama_toko: storeName,
        nama_pembeli: customerName.trim(),
        alamat: customerAddress.trim() || "—",
        kota: city.trim() || "—",
        kurir: courierLabel,
        metode_bayar: paymentLabel,
        nomor_pesanan: data.order_number || "",
        total: formatRupiah(data.total_cents ?? grandTotal),
        ringkasan_produk: ringkasan,
        catatan_pembeli: notes ? `Catatan: ${notes}` : "",
      });
      const url = waLink(storeWhatsApp || "", message);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      orderPlacedRef.current = true;
      clear();
      push(`/${storeSlug}/order/${data.order_number}`);
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // ────── Render ──────

  if (!isHydrated) {
    // Avoid a flash of "empty" before localStorage rehydrates.
    return (
      <Card>
        <p className="text-sm text-neutral-500">Memuat…</p>
      </Card>
    );
  }
  if (items.length === 0) return null; // will redirect via useEffect

  const visibleSteps: { num: Step; label: string; icon: typeof User }[] = [
    { num: 1, label: "Identitas", icon: User },
    ...(skipShippingStep ? [] : [{ num: 2 as Step, label: "Pengiriman", icon: Truck }]),
    { num: 3, label: "Pembayaran", icon: CreditCard },
  ];

  return (
    <div className="flex flex-col gap-5">
      {acceptingOrdersReason === "order_limit" && (
        <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong>
              Penjual sementara tidak menerima pesanan baru.
            </strong>{" "}
            Untuk pemesanan atau info lebih lanjut, silakan hubungi langsung
            admin toko.
          </p>
          {storeWhatsApp && (
            <a
              href={waLink(
                storeWhatsApp,
                `Halo ${storeName}, saya mau tanya soal pemesanan.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Chat Admin Toko
            </a>
          )}
        </div>
      )}
      {acceptingOrdersReason !== "order_limit" && !storeOpen && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
          <strong>Toko sedang tutup.</strong> Pesanan kamu tetap diterima dan
          akan diproses saat toko buka kembali.
        </div>
      )}
      <Stepper steps={visibleSteps} active={step} />

      {step === 1 && (
        <StepCard title="Informasi Kontak" icon={User}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cw_name">Nama Lengkap *</Label>
              <Input
                id="cw_name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Bu Sari"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cw_wa">Nomor WhatsApp *</Label>
              <Input
                id="cw_wa"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={customerWA}
                onChange={(e) => setCustomerWA(e.target.value)}
                placeholder="0812-3456-7890"
                required
                aria-invalid={
                  customerWA.trim().length > 0 && !isValidWA(customerWA)
                }
                className={cn(
                  customerWA.trim().length > 0 &&
                    !isValidWA(customerWA) &&
                    "border-danger focus:border-danger focus:ring-danger/30",
                )}
              />
              {customerWA.trim().length > 0 && !isValidWA(customerWA) ? (
                <p className="text-xs font-medium text-danger">
                  Nomor WhatsApp tidak valid. Contoh: 0812-3456-7890 atau +62 812 3456 7890.
                </p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Pastikan nomor aktif — penjual akan konfirmasi via WhatsApp.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cw_email">
                Email{hasDigital ? " *" : " (opsional)"}
              </Label>
              <Input
                id="cw_email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="kamu@email.com"
                required={hasDigital}
                aria-invalid={
                  customerEmail.trim().length > 0 &&
                  !isValidEmail(customerEmail)
                }
                className={cn(
                  customerEmail.trim().length > 0 &&
                    !isValidEmail(customerEmail) &&
                    "border-danger focus:border-danger focus:ring-danger/30",
                )}
              />
              {customerEmail.trim().length > 0 &&
              !isValidEmail(customerEmail) ? (
                <p className="text-xs font-medium text-danger">
                  Format email tidak valid. Contoh: kamu@email.com.
                </p>
              ) : hasDigital ? (
                <p className="text-xs text-neutral-500">
                  Link download produk digital akan dikirim ke email ini.
                </p>
              ) : null}
            </div>
          </div>
        </StepCard>
      )}

      {step === 2 && !skipShippingStep && (
        <StepCard title="Alamat & Kurir" icon={Truck}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cw_address">Alamat Pengiriman *</Label>
              <textarea
                id="cw_address"
                rows={2}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Jalan, RT/RW, kelurahan, kecamatan…"
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <CityPicker
              label="Kota / Kabupaten *"
              placeholder="Cari (mis. Yogyakarta)…"
              selectedID={cityID}
              selectedName={city}
              onChange={(id, name) => {
                setCityID(id);
                setCity(name);
              }}
              description="Ongkir dihitung otomatis berdasarkan kota."
            />
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
                  Belum ada opsi kurir untuk kota ini. Bisa lanjut tanpa pilih kurir;
                  ongkir akan dikonfirmasi penjual via WhatsApp.
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
          </div>
        </StepCard>
      )}

      {step === 3 && (
        <StepCard title="Bayar & Konfirmasi" icon={CreditCard}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cw_method">Metode Pembayaran</Label>
              <Select
                id="cw_method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {paymentMethods.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cw_notes">Catatan (opsional)</Label>
              <textarea
                id="cw_notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: minta dibungkus rapi, jadwal pengiriman, dll."
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cw_promo" className="flex items-center gap-1.5">
                <Tag className="size-3.5 text-brand-600" aria-hidden />
                Kode Promo
              </Label>
              {appliedPromo ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-success">
                      {appliedPromo.code}
                    </p>
                    <p className="text-xs text-neutral-700">
                      {appliedPromo.free_shipping
                        ? "Gratis ongkir"
                        : `Diskon ${formatRupiah(appliedPromo.discount_cents)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearPromo}
                    className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-danger"
                    aria-label="Hapus kode promo"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="cw_promo"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="DISC10"
                    className="flex-1 font-mono"
                  />
                  <Button
                    type="button"
                    size="md"
                    variant="outline"
                    onClick={applyPromo}
                    disabled={promoLoading || promoInput.trim() === ""}
                  >
                    {promoLoading ? "Cek…" : "Pakai"}
                  </Button>
                </div>
              )}
              {promoError && (
                <p className="text-xs font-medium text-danger">{promoError}</p>
              )}
            </div>

            <ReviewSummary
              items={items}
              subtotal={subtotal}
              shippingCents={shippingCents}
              baseShippingCents={baseShippingCents}
              discountCents={discountCents}
              freeShipping={!!appliedPromo?.free_shipping}
              grandTotal={grandTotal}
              skipShipping={skipShippingStep}
              pickedOptionLabel={pickedOption ? `${pickedOption.courier} ${pickedOption.service}` : ""}
            />
          </div>
        </StepCard>
      )}

      
      <div className="flex items-center justify-between gap-3">
        {step === 1 ? (
          <Link href={`/${storeSlug}/cart`}>
            <Button type="button" size="md" variant="ghost">
              <ArrowLeft className="size-4" aria-hidden />
              Kembali ke keranjang
            </Button>
          </Link>
        ) : (
          <Button
            type="button"
            size="md"
            variant="ghost"
            onClick={back}
            disabled={submitting}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Sebelumnya
          </Button>
        )}

        {step < 3 ? (
          <Button
            type="button"
            size="md"
            onClick={next}
            disabled={!acceptingOrders}
          >
            Lanjut
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="button"
            size="md"
            onClick={submit}
            disabled={submitting || !acceptingOrders}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            {submitting ? "Memproses…" : "Buat Pesanan"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({
  steps,
  active,
}: {
  steps: { num: number; label: string; icon: typeof User }[];
  active: number;
}) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto rounded-lg border border-neutral-200 bg-white p-2">
      {steps.map((s, idx) => {
        const isActive = active === s.num;
        const isDone = active > s.num;
        const Icon = s.icon;
        return (
          <li
            key={s.num}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm",
              isActive && "bg-brand-50 font-semibold text-brand-700",
              isDone && "text-neutral-500",
              !isActive && !isDone && "text-neutral-500",
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs",
                isActive
                  ? "bg-brand-600 text-white"
                  : isDone
                    ? "bg-success/20 text-success"
                    : "bg-neutral-100 text-neutral-500",
              )}
            >
              {isDone ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
            </span>
            <span className="truncate">{s.label}</span>
            {idx < steps.length - 1 && (
              <span aria-hidden className="ml-auto text-neutral-300">·</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof User;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-brand-600" aria-hidden />
        <h2 className="font-semibold text-neutral-900">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function ReviewSummary({
  items,
  subtotal,
  shippingCents,
  baseShippingCents,
  discountCents,
  freeShipping,
  grandTotal,
  skipShipping,
  pickedOptionLabel,
}: {
  items: ReturnType<typeof useCart>["items"];
  subtotal: number;
  shippingCents: number;
  baseShippingCents: number;
  discountCents: number;
  freeShipping: boolean;
  grandTotal: number;
  skipShipping: boolean;
  pickedOptionLabel: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <ShoppingCart className="size-4 text-brand-600" aria-hidden />
        Ringkasan Pesanan
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {items.map((it) => (
          <li
            key={`${it.product_id}:${it.variant_id ?? ""}`}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="min-w-0 truncate text-neutral-700">
              {it.qty}× {it.product_name}
              {it.variant_name && (
                <span className="text-neutral-400"> ({it.variant_name})</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-neutral-700">
              {formatRupiah(it.unit_price_cents * it.qty)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 flex flex-col gap-1.5 border-t border-neutral-200 pt-3 text-sm">
        <div className="flex justify-between text-neutral-600">
          <dt>Subtotal</dt>
          <dd className="font-mono">{formatRupiah(subtotal)}</dd>
        </div>
        {discountCents > 0 && (
          <div className="flex justify-between text-success">
            <dt>Diskon</dt>
            <dd className="font-mono">−{formatRupiah(discountCents)}</dd>
          </div>
        )}
        {!skipShipping && (
          <div className="flex justify-between text-neutral-600">
            <dt>
              Ongkir
              {freeShipping && (
                <span className="ml-1 text-xs text-success">(Gratis!)</span>
              )}
              {pickedOptionLabel && (
                <span className="ml-1 text-xs text-neutral-400">
                  · {pickedOptionLabel}
                </span>
              )}
            </dt>
            <dd className="font-mono">
              {freeShipping ? (
                <>
                  <span className="text-neutral-400 line-through">
                    {formatRupiah(baseShippingCents)}
                  </span>{" "}
                  {formatRupiah(0)}
                </>
              ) : (
                formatRupiah(shippingCents)
              )}
            </dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-neutral-200 pt-2 font-display text-lg font-semibold text-neutral-900">
          <dt>Total</dt>
          <dd className="font-mono">{formatRupiah(grandTotal)}</dd>
        </div>
      </dl>
    </div>
  );
}
