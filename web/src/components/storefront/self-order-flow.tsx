"use client";

import { useMemo, useState } from "react";
import { Utensils, ShoppingBag, Plus, Minus, Package, CheckCircle2, ArrowLeft, X } from "lucide-react";
import { formatRupiah } from "@/lib/format";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Variant = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
};

type Product = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
  photo_url?: string;
  has_variants: boolean;
  product_type: string;
  variants: Variant[];
};

type Props = {
  slug: string;
  storeName: string;
  tableId: string;
  tableLabel: string;
  paymentMode?: "cashier" | "online";
  products: Product[];
};

type Step = "choose" | "menu" | "identity" | "done";

// A cart line is keyed by variant id when present, else by product id — so the
// same product's different variants are distinct lines.
type CartLine = {
  productId: string;
  variantId?: string;
  name: string; // display name, e.g. "Tote Bag — Merah"
  price_cents: number;
  qty: number;
};

const lineKey = (productId: string, variantId?: string) =>
  variantId ? `v:${variantId}` : `p:${productId}`;

export function SelfOrderFlow({ slug, storeName, tableId, tableLabel, paymentMode = "cashier", products }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [serving, setServing] = useState<"dine_in" | "takeaway">("dine_in");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [wa, setWa] = useState("");
  const [busy, setBusy] = useState(false);
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const lines = useMemo(() => Object.values(cart).filter((l) => l.qty > 0), [cart]);
  const total = lines.reduce((sum, l) => sum + l.price_cents * l.qty, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  // Per-product total qty across its variant lines — drives the menu-row badge.
  const qtyForProduct = (productId: string) =>
    lines.reduce((sum, l) => (l.productId === productId ? sum + l.qty : sum), 0);

  const setLineQty = (line: Omit<CartLine, "qty">, nextQty: number) => {
    const key = lineKey(line.productId, line.variantId);
    setCart((c) => {
      const next = { ...c };
      const q = Math.max(0, nextQty);
      if (q === 0) {
        delete next[key];
      } else {
        next[key] = { ...line, qty: q };
      }
      return next;
    });
  };

  const bumpLine = (line: Omit<CartLine, "qty">, delta: number) => {
    const key = lineKey(line.productId, line.variantId);
    setLineQty(line, (cart[key]?.qty ?? 0) + delta);
  };

  const submit = async () => {
    if (!name.trim() || !wa.trim()) {
      setErr("Nama & WhatsApp wajib diisi");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${apiBase}/api/v1/storefront/${slug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_whatsapp: wa.trim(),
          table_id: tableId,
          serving_type: serving,
          payment_method: paymentMode === "online" ? "midtrans" : "cashier",
          items: lines.map((l) => ({
            product_id: l.productId,
            variant_id: l.variantId,
            quantity: l.qty,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Gagal mengirim pesanan");
        return;
      }
      setQueueNumber(data.queue_number ?? null);
      setStep("done");
    } catch {
      setErr("Gagal mengirim pesanan");
    } finally {
      setBusy(false);
    }
  };

  // ── Step: choose serving type ──────────────────────────────────────────
  if (step === "choose") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-neutral-50 p-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-neutral-900">{storeName}</h1>
          <p className="mt-1 text-neutral-500">Meja {tableLabel} · pesan sendiri dari HP</p>
        </div>
        <div className="grid w-full max-w-md grid-cols-2 gap-4">
          {(["dine_in", "takeaway"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setServing(s);
                setStep("menu");
              }}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-neutral-200 bg-white p-8 transition-colors hover:border-brand-500 hover:bg-brand-50"
            >
              {s === "dine_in" ? <Utensils className="size-10 text-brand-600" aria-hidden /> : <ShoppingBag className="size-10 text-brand-600" aria-hidden />}
              <span className="font-semibold text-neutral-900">{s === "dine_in" ? "Makan di Tempat" : "Bawa Pulang"}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step: done ─────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center">
        <CheckCircle2 className="size-16 text-brand-600" aria-hidden />
        <h1 className="font-display text-2xl font-bold text-neutral-900">Pesanan diterima!</h1>
        {queueNumber != null && (
          <div className="rounded-2xl bg-brand-600 px-10 py-6 text-white">
            <p className="text-sm">Nomor Antrian</p>
            <p className="font-display text-6xl font-bold">{queueNumber}</p>
          </div>
        )}
        <p className="max-w-sm text-neutral-600">
          {queueNumber != null
            ? "Pesananmu sedang disiapkan dapur. Bayar di kasir ya. Pantau nomor antrianmu di layar."
            : "Pesananmu sudah masuk. Silakan bayar di kasir ya — staf akan menyiapkan pesananmu."}
        </p>
      </div>
    );
  }

  // ── Step: menu + cart, or identity ─────────────────────────────────────
  return (
    <div className="flex min-h-svh flex-col bg-neutral-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <button
          onClick={() => setStep(step === "identity" ? "menu" : "choose")}
          className="flex size-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-neutral-900">{storeName}</p>
          <p className="text-xs text-neutral-500">
            Meja {tableLabel} · {serving === "dine_in" ? "Makan di Tempat" : "Bawa Pulang"}
          </p>
        </div>
      </header>

      {step === "menu" ? (
        <>
          <div className="flex-1 space-y-2 p-3 pb-28">
            {products.map((p) => {
              const variants = p.variants ?? [];
              // A variant product with no loaded variants can't be self-ordered.
              const variantUnavailable = p.has_variants && variants.length === 0;
              const allVariantsOut = p.has_variants && variants.length > 0 && variants.every((v) => v.stock <= 0);
              const disabled =
                variantUnavailable ||
                allVariantsOut ||
                (!p.has_variants && p.product_type !== "digital" && p.stock <= 0);

              const productQty = qtyForProduct(p.id);
              const minVariantPrice = variants.length
                ? Math.min(...variants.map((v) => v.price_cents))
                : p.price_cents;

              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt={p.name} className="size-full object-cover" />
                    ) : (
                      <Package className="size-6 text-neutral-400" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">{p.name}</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {p.has_variants ? `Mulai ${formatRupiah(minVariantPrice)}` : formatRupiah(p.price_cents)}
                    </p>
                    {variantUnavailable && <p className="text-xs text-amber-600">Ada varian — pesan ke staf</p>}
                    {allVariantsOut && <p className="text-xs text-neutral-400">Stok habis</p>}
                  </div>
                  {!disabled && (
                    p.has_variants ? (
                      <button
                        onClick={() => setSheetProduct(p)}
                        className="relative rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        {productQty > 0 ? "Ubah" : "Pilih"}
                        {productQty > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white tabular-nums">
                            {productQty}
                          </span>
                        )}
                      </button>
                    ) : productQty === 0 ? (
                      <button
                        onClick={() => setLineQty({ productId: p.id, name: p.name, price_cents: p.price_cents }, 1)}
                        className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        Tambah
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => bumpLine({ productId: p.id, name: p.name, price_cents: p.price_cents }, -1)}
                          className="flex size-8 items-center justify-center rounded-lg border border-neutral-200"
                        >
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span className="w-6 text-center font-semibold tabular-nums">{productQty}</span>
                        <button
                          onClick={() => bumpLine({ productId: p.id, name: p.name, price_cents: p.price_cents }, 1)}
                          className="flex size-8 items-center justify-center rounded-lg border border-neutral-200"
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
          {count > 0 && (
            <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-4">
              <button onClick={() => setStep("identity")} className="flex w-full items-center justify-between rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">
                <span>{count} item</span>
                <span>Lanjut · {formatRupiah(total)}</span>
              </button>
            </div>
          )}

          {/* Variant picker bottom sheet */}
          {sheetProduct && (
            <div className="fixed inset-0 z-20 flex items-end" role="dialog" aria-modal="true">
              <button
                className="absolute inset-0 bg-black/40"
                aria-label="Tutup"
                onClick={() => setSheetProduct(null)}
              />
              <div className="relative z-10 max-h-[80svh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-6">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{sheetProduct.name}</p>
                    <p className="text-xs text-neutral-500">Pilih varian</p>
                  </div>
                  <button
                    onClick={() => setSheetProduct(null)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
                    aria-label="Tutup"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="space-y-2">
                  {(sheetProduct.variants ?? []).map((v) => {
                    const key = lineKey(sheetProduct.id, v.id);
                    const qty = cart[key]?.qty ?? 0;
                    const out = v.stock <= 0;
                    const atStock = qty >= v.stock;
                    const line = {
                      productId: sheetProduct.id,
                      variantId: v.id,
                      name: `${sheetProduct.name} — ${v.name}`,
                      price_cents: v.price_cents,
                    };
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">{v.name}</p>
                          <p className="text-sm font-semibold text-neutral-900">{formatRupiah(v.price_cents)}</p>
                          {out ? (
                            <p className="text-xs text-neutral-400">Stok habis</p>
                          ) : (
                            <p className="text-xs text-neutral-400">Stok {v.stock}</p>
                          )}
                        </div>
                        {out ? (
                          <span className="text-xs font-medium text-neutral-400">Habis</span>
                        ) : qty === 0 ? (
                          <button
                            onClick={() => setLineQty(line, 1)}
                            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                          >
                            Tambah
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => bumpLine(line, -1)}
                              className="flex size-8 items-center justify-center rounded-lg border border-neutral-200"
                            >
                              <Minus className="size-4" aria-hidden />
                            </button>
                            <span className="w-6 text-center font-semibold tabular-nums">{qty}</span>
                            <button
                              onClick={() => bumpLine(line, 1)}
                              disabled={atStock}
                              className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 disabled:opacity-40"
                            >
                              <Plus className="size-4" aria-hidden />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => setSheetProduct(null)}
                  className="mt-4 w-full rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white"
                >
                  Selesai
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 space-y-4 p-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-3 font-semibold text-neutral-900">Ringkasan</h2>
            <ul className="space-y-1 text-sm">
              {lines.map((l) => (
                <li key={lineKey(l.productId, l.variantId)} className="flex justify-between gap-2">
                  <span className="min-w-0">{l.name} ×{l.qty}</span>
                  <span className="shrink-0">{formatRupiah(l.price_cents * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-neutral-100 pt-3 font-semibold">
              <span>Total</span>
              <span>{formatRupiah(total)}</span>
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Nama</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" className="h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm focus:border-brand-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">No. WhatsApp</label>
              <input value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" placeholder="0812xxxx" className="h-11 w-full rounded-lg border border-neutral-200 px-3 font-mono text-sm focus:border-brand-500 focus:outline-none" />
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
            <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white disabled:bg-neutral-300">
              {busy ? "Mengirim..." : `Pesan Sekarang · ${formatRupiah(total)}`}
            </button>
            <p className="text-center text-xs text-neutral-500">Bayar di kasir setelah pesan.</p>
          </div>
        </div>
      )}
    </div>
  );
}
