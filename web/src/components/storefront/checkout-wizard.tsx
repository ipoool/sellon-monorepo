"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { showError } from "@/lib/toast";
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
  ClipboardCheck,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CityPicker } from "@/components/dashboard/city-picker";
import { formatRupiah } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { CheckoutConfig, CheckoutField } from "@/lib/types";
import { useCart, cartItemKey } from "./cart-context";
import { CartNotices } from "./cart-notices";
import { trackInitiateCheckout } from "@/lib/meta-pixel";

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

type Props = {
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  storeOpen: boolean;
  acceptingOrders: boolean;
  acceptingOrdersReason: "" | "store_closed" | "order_limit";
  payment: StorefrontPayment;
  checkoutConfig?: CheckoutConfig;
  taxEnabled?: boolean;
  taxBps?: number;
  taxInclusive?: boolean;
  taxLabel?: string;
};

type Step = 1 | 2 | 3 | 4;

export function CheckoutWizard({
  storeSlug,
  storeName,
  storeWhatsApp,
  storeOpen,
  acceptingOrders,
  acceptingOrdersReason,
  payment,
  checkoutConfig,
  taxEnabled = false,
  taxBps = 0,
  taxInclusive = false,
  taxLabel = "Pajak",
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

  // Meta Pixel InitiateCheckout — once, after the cart hydrates with items.
  const checkoutTrackedRef = useRef(false);
  useEffect(() => {
    if (!isHydrated || items.length === 0 || checkoutTrackedRef.current) return;
    checkoutTrackedRef.current = true;
    trackInitiateCheckout(
      items.map((it) => ({ id: it.product_id, quantity: it.qty, item_price: it.unit_price_cents / 100 })),
      subtotal / 100,
    );
  }, [isHydrated, items, subtotal]);

  const [step, setStep] = useState<Step>(1);
  const [customerName, setCustomerName] = useState("");
  const [customerWA, setCustomerWA] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [city, setCity] = useState("");
  const [cityID, setCityID] = useState("");

  const [shipping, setShipping] = useState<ShippingOption[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  // Distinct from "no courier for this city": a 5xx / network failure must not
  // read as "penjual tidak melayani kota ini".
  const [quoteError, setQuoteError] = useState<string | null>(null);
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

  // Seller-configured checkout fields.
  const emailMode = checkoutConfig?.email_mode ?? "optional";
  const showEmail = emailMode !== "hidden" || hasDigital; // digital always needs email
  const customFields = checkoutConfig?.fields ?? [];
  const identityFields = customFields.filter((f) => f.step === "identity");
  const shippingFields = customFields.filter((f) => f.step === "shipping");
  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>({});
  const setCustomValue = (key: string, val: string | boolean) =>
    setCustomValues((v) => ({ ...v, [key]: val }));

  const missingRequiredCustom = (fields: CheckoutField[]): string | null => {
    for (const f of fields) {
      if (!f.required) continue;
      const v = customValues[f.key];
      const empty =
        f.type === "checkbox" ? v !== true : !String(v ?? "").trim();
      if (empty) return `${f.label} wajib diisi`;
    }
    return null;
  };

  const renderCustomFields = (fields: CheckoutField[]): ReactNode => {
    if (fields.length === 0) return null;
    return (
      <div className="flex flex-col gap-4">
        {fields.map((f) => {
          const v = customValues[f.key];
          const labelEl = (
            <Label htmlFor={`cf-${f.key}`}>
              {f.label}
              {f.required && <span className="text-danger"> *</span>}
            </Label>
          );
          if (f.type === "checkbox") {
            return (
              <label key={f.key} className="flex items-center gap-2.5 text-sm text-neutral-700">
                <input
                  id={`cf-${f.key}`}
                  type="checkbox"
                  checked={v === true}
                  onChange={(e) => setCustomValue(f.key, e.target.checked)}
                  className="size-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                />
                {f.label}
                {f.required && <span className="text-danger">*</span>}
              </label>
            );
          }
          if (f.type === "textarea") {
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                {labelEl}
                <textarea
                  id={`cf-${f.key}`}
                  value={String(v ?? "")}
                  onChange={(e) => setCustomValue(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            );
          }
          if (f.type === "select") {
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                {labelEl}
                <Select
                  id={`cf-${f.key}`}
                  value={String(v ?? "")}
                  onChange={(e) => setCustomValue(f.key, e.target.value)}
                >
                  <option value="">{f.placeholder || "Pilih…"}</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </div>
            );
          }
          return (
            <div key={f.key} className="flex flex-col gap-1.5">
              {labelEl}
              <Input
                id={`cf-${f.key}`}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={String(v ?? "")}
                onChange={(e) => setCustomValue(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            </div>
          );
        })}
      </div>
    );
  };

  // Fetch shipping options whenever cart + city change. Quote endpoint
  // takes the items array verbatim so multi-product carts get a real
  // total, not just one product's quote.
  useEffect(() => {
    if (skipShippingStep) {
      setShipping([]);
      setPickedShipping("");
      setQuoteError(null);
      return;
    }
    const trimmed = city.trim();
    if (trimmed.length < 3 || items.length === 0) {
      setShipping([]);
      setPickedShipping("");
      setQuoteError(null);
      return;
    }
    const ctrl = new AbortController();
    setShippingLoading(true);
    setQuoteError(null);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch(
            `${apiBase}/api/v1/storefront/${storeSlug}/shipping/quote`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                city: trimmed,
                city_id: cityID,
                items: items.reduce<
                  Array<{ product_id: string; quantity: number }>
                >((acc, it) => {
                  if (it.product_type === "physical") {
                    acc.push({ product_id: it.product_id, quantity: it.qty });
                  }
                  return acc;
                }, []),
              }),
              signal: ctrl.signal,
            },
          );
          // A superseded request must not touch state — its `.finally` used to
          // clear the loading flag while the newer request was still in flight.
          if (ctrl.signal.aborted) return;
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            setShipping([]);
            setQuoteError(
              (d as { error?: string }).error ||
                "Gagal menghitung ongkir, coba lagi.",
            );
            return;
          }
          setShipping((d.options as ShippingOption[]) || []);
          setQuoteError(null);
        } catch {
          if (!ctrl.signal.aborted) {
            setShipping([]);
            setQuoteError("Gagal menghitung ongkir, coba lagi.");
          }
        } finally {
          if (!ctrl.signal.aborted) setShippingLoading(false);
        }
      })();
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
  // Tax preview (server is authoritative). Base = subtotal − discount (goods).
  // Exclusive tax adds to the total; inclusive is informational (total unchanged).
  const taxBase = Math.max(0, subtotal - discountCents);
  const effectiveTaxBps = taxEnabled ? taxBps : 0;
  const taxCents =
    effectiveTaxBps > 0
      ? taxInclusive
        ? Math.round((taxBase * effectiveTaxBps) / (10000 + effectiveTaxBps))
        : Math.round((taxBase * effectiveTaxBps) / 10000)
      : 0;
  const grandTotal =
    Math.max(0, subtotal - discountCents) + shippingCents + (taxInclusive ? 0 : taxCents);

  // Re-validate the applied promo whenever the amounts it was validated against
  // change. Depends on the promo CODE, never the object: depending on
  // `appliedPromo` while the handler called setAppliedPromo({...}) with a fresh
  // object re-armed the effect on its own result — an endless validate loop
  // (~5-20 req/s for every buyer sitting on the payment/review step).
  const appliedPromoCode = appliedPromo?.code ?? "";
  useEffect(() => {
    if (!appliedPromoCode) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `${apiBase}/api/v1/storefront/${storeSlug}/promos/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: appliedPromoCode,
              subtotal_cents: subtotal,
              shipping_cents: baseShippingCents,
            }),
            signal: ctrl.signal,
          },
        );
        if (ctrl.signal.aborted) return;
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          // The promo stopped applying (min spend, quota, expiry) — drop it and
          // say why instead of silently keeping a discount the server rejects.
          setAppliedPromo(null);
          setPromoError(
            (d as { error?: string }).error ||
              "Promo tidak berlaku lagi untuk keranjang ini",
          );
          return;
        }
        setPromoError(null);
        setAppliedPromo((prev) => {
          if (!prev || prev.code !== appliedPromoCode) return prev;
          const nextDiscount = d.discount_cents ?? 0;
          const nextFree = !!d.free_shipping;
          // Identical result → keep the SAME object so nothing downstream
          // re-renders and this effect can't re-arm itself.
          if (
            prev.type === d.type &&
            prev.discount_cents === nextDiscount &&
            prev.free_shipping === nextFree
          ) {
            return prev;
          }
          return {
            code: prev.code,
            type: d.type,
            discount_cents: nextDiscount,
            free_shipping: nextFree,
          };
        });
      } catch {
        // Aborted or offline — keep the current promo, the server re-checks
        // it authoritatively at order creation anyway.
      }
    })();
    return () => ctrl.abort();
  }, [appliedPromoCode, subtotal, baseShippingCents, storeSlug]);

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
      if ((hasDigital || emailMode === "required") && !customerEmail.trim())
        return hasDigital
          ? "Email wajib diisi untuk produk digital"
          : "Email wajib diisi";
      // Email is optional for non-digital orders, but if the buyer typed
      // anything it should still be a valid address.
      if (customerEmail.trim() && !isValidEmail(customerEmail))
        return "Format email tidak valid";
      const idMiss = missingRequiredCustom(identityFields);
      if (idMiss) return idMiss;
    }
    if (forStep >= 2 && !skipShippingStep) {
      if (!customerAddress.trim()) return "Alamat pengiriman wajib diisi";
      if (!city.trim()) return "Kota tujuan wajib diisi";
      const shipMiss = missingRequiredCustom(shippingFields);
      if (shipMiss) return shipMiss;
    }
    return null;
  }

  function next() {
    const reason = blockReason(step);
    if (reason) {
      showError(reason);
      return;
    }
    // All-digital carts skip the shipping step (2).
    if (step === 1 && skipShippingStep) {
      setStep(3);
      return;
    }
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  function back() {
    // From Payment (3) back to Identitas (1) when shipping is skipped.
    if (step === 3 && skipShippingStep) {
      setStep(1);
      return;
    }
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function submit() {
    const finalCheck = blockReason(4);
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
    const wantsMidtrans = paymentMethod === "midtrans_snap";

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
            selected_option_ids: (it.selected_options ?? []).map(
              (o) => o.option_id,
            ),
          })),
          custom_fields: customValues,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const orderNumber = String(data.order_number ?? "");

      // CreateOrder does NOT mint a Snap transaction, so a Midtrans-only store
      // used to land the buyer on an order page with an empty payment_url and
      // the "penjual belum mengatur metode pembayaran" notice. Mint it here.
      // Best-effort: the order page has a "Buat link pembayaran" retry.
      if (wantsMidtrans && orderNumber) {
        try {
          await fetch(
            `${apiBase}/api/v1/storefront/${storeSlug}/orders/${orderNumber}/payment-link`,
            { method: "POST" },
          );
        } catch {
          // ignore — buyer can retry from the order page
        }
      }

      // The server recomputes every amount from the DB. When its total differs
      // from what the buyer just reviewed (a price changed under a stale cart),
      // flag it so the order page can say so instead of quietly charging more.
      const serverTotal =
        typeof data.total_cents === "number" ? data.total_cents : grandTotal;
      const priceChanged = serverTotal !== grandTotal;

      // NOTE: no window.open here. Called after an await it lands outside the
      // user-activation window and mobile Safari/Chrome block it — the buyer
      // never saw WhatsApp. The order page offers it as a real link instead.
      orderPlacedRef.current = true;
      clear();
      push(
        `/${storeSlug}/order/${orderNumber}${priceChanged ? "?updated=1" : ""}`,
      );
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
    { num: 4, label: "Review", icon: ClipboardCheck },
  ];

  const paymentLabelText =
    paymentMethods.find((p) => p.value === paymentMethod)?.label || "—";
  const courierLabelText = skipShippingStep
    ? "Digital — kirim via link"
    : pickedOption
      ? `${pickedOption.courier} ${pickedOption.service}`
      : "Dikonfirmasi penjual";

  return (
    <div className="flex flex-col gap-5">
      <CartNotices />
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
            {showEmail && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cw_email">
                Email{hasDigital || emailMode === "required" ? " *" : " (opsional)"}
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
            )}
            {renderCustomFields(identityFields)}
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
              ) : quoteError ? (
                <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-xs text-neutral-700">
                  {quoteError} Kamu tetap bisa lanjut tanpa pilih kurir — ongkir
                  akan dikonfirmasi penjual via WhatsApp.
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
            {renderCustomFields(shippingFields)}
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
          </div>
        </StepCard>
      )}

      {step === 4 && (
        <StepCard title="Review & Konfirmasi" icon={ClipboardCheck}>
          <div className="flex flex-col gap-4">
            {/* Data pembeli */}
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <User className="size-4 text-brand-600" aria-hidden />
                Kontak
              </div>
              <dl className="mt-2 flex flex-col gap-1 text-sm">
                <InfoRow label="Nama" value={customerName.trim() || "—"} />
                <InfoRow label="WhatsApp" value={customerWA.trim() || "—"} />
                {customerEmail.trim() && (
                  <InfoRow label="Email" value={customerEmail.trim()} />
                )}
              </dl>
            </div>

            {/* Pengiriman */}
            {!skipShippingStep && (
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  <MapPin className="size-4 text-brand-600" aria-hidden />
                  Pengiriman
                </div>
                <dl className="mt-2 flex flex-col gap-1 text-sm">
                  <InfoRow label="Alamat" value={customerAddress.trim() || "—"} />
                  <InfoRow label="Kota" value={city.trim() || "—"} />
                  <InfoRow label="Kurir" value={courierLabelText} />
                </dl>
              </div>
            )}

            {/* Pembayaran + catatan */}
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <CreditCard className="size-4 text-brand-600" aria-hidden />
                Pembayaran
              </div>
              <dl className="mt-2 flex flex-col gap-1 text-sm">
                <InfoRow label="Metode" value={paymentLabelText} />
                {appliedPromo && (
                  <InfoRow label="Promo" value={appliedPromo.code} />
                )}
                {notes.trim() && <InfoRow label="Catatan" value={notes.trim()} />}
              </dl>
            </div>

            <ReviewSummary
              items={items}
              subtotal={subtotal}
              shippingCents={shippingCents}
              baseShippingCents={baseShippingCents}
              discountCents={discountCents}
              freeShipping={!!appliedPromo?.free_shipping}
              taxCents={taxCents}
              taxBps={effectiveTaxBps}
              taxInclusive={taxInclusive}
              taxLabel={taxLabel}
              grandTotal={grandTotal}
              skipShipping={skipShippingStep}
              pickedOptionLabel={pickedOption ? `${pickedOption.courier} ${pickedOption.service}` : ""}
            />
          </div>
        </StepCard>
      )}

      <div className="flex items-center justify-between gap-3">
        {step === 1 ? (
          // asChild → one interactive element (a <Link>), not a Button nested
          // inside a Link (two tab stops for one CTA).
          <Button asChild size="md" variant="ghost">
            <Link href={`/${storeSlug}/cart`}>
              <ArrowLeft className="size-4" aria-hidden />
              Kembali ke keranjang
            </Link>
          </Button>
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

        {step < 4 ? (
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

      {/* Trust note — moved here from the page header. */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-500">
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        Checkout aman — data kamu terenkripsi & tidak dibagikan.
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-right text-neutral-800">{value}</dd>
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
  taxCents,
  taxBps,
  taxInclusive,
  taxLabel,
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
  taxCents: number;
  taxBps: number;
  taxInclusive: boolean;
  taxLabel: string;
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
            key={cartItemKey(it)}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="min-w-0 truncate text-neutral-700">
              {it.qty}× {it.product_name}
              {it.variant_name && (
                <span className="text-neutral-400"> ({it.variant_name})</span>
              )}
              {it.selected_options && it.selected_options.length > 0 && (
                <span className="text-neutral-400">
                  {" "}
                  ·{" "}
                  {it.selected_options.map((o) => o.option_name).join(", ")}
                </span>
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
        {taxCents > 0 && (
          <div className="flex justify-between text-neutral-600">
            <dt>
              {taxLabel}
              {taxBps ? ` (${(taxBps / 100).toLocaleString("id-ID")}%)` : ""}
              {taxInclusive ? " · termasuk" : ""}
            </dt>
            <dd className="font-mono">
              {taxInclusive ? "" : "+"}
              {formatRupiah(taxCents)}
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
