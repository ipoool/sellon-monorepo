"use client";

import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";

import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/storefront/cart-context";
import type { SelectedOption } from "@/lib/types";
import type { KioskProduct, KioskModifierOption } from "./types";

// Bottom sheet to pick a variant + modifier add-ons before adding to the cart.
// Mirrors the product-detail AddToCartPanel rules: variant required when the
// product has variants, single/multi modifier groups, required groups block
// the add, and the unit price folds in the chosen option deltas.
export function KioskOptionSheet({
  product,
  onClose,
}: {
  product: KioskProduct;
  onClose: () => void;
}) {
  const cart = useCart();
  const variants = product.variants ?? [];
  // Stable across renders so the optionDelta useMemo deps don't churn.
  const groups = useMemo(() => product.modifiers ?? [], [product.modifiers]);
  const hasVariants = (product.has_variants ?? false) && variants.length > 0;

  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [variantId, setVariantId] = useState<string>(
    hasVariants ? (firstInStock?.id ?? "") : "",
  );
  // selected options keyed by group id → set of option ids.
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const variant = variants.find((v) => v.id === variantId);
  const basePrice = variant ? variant.price_cents : product.price_cents;
  const stock = variant ? variant.stock : product.stock;

  const optionDelta = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      for (const oid of selected[g.id] ?? []) {
        const o = g.options.find((x) => x.id === oid);
        if (o) sum += o.price_delta_cents;
      }
    }
    return sum;
  }, [groups, selected]);

  const unitPrice = basePrice + optionDelta;

  const missingRequired = groups.some(
    (g) => g.is_required && (selected[g.id]?.length ?? 0) === 0,
  );
  const variantMissing = hasVariants && !variantId;
  const outOfStock = stock <= 0;
  const blocked = missingRequired || variantMissing || outOfStock;

  function toggleOption(groupId: string, selection: string, opt: KioskModifierOption) {
    setSelected((prev) => {
      const cur = prev[groupId] ?? [];
      if (selection === "single") {
        return { ...prev, [groupId]: cur.includes(opt.id) ? [] : [opt.id] };
      }
      return {
        ...prev,
        [groupId]: cur.includes(opt.id)
          ? cur.filter((x) => x !== opt.id)
          : [...cur, opt.id],
      };
    });
  }

  function add() {
    if (blocked) return;
    const selectedOptions: SelectedOption[] = [];
    for (const g of groups) {
      for (const oid of selected[g.id] ?? []) {
        const o = g.options.find((x) => x.id === oid);
        if (o) {
          selectedOptions.push({
            option_id: o.id,
            group_name: g.name,
            option_name: o.name,
            price_delta_cents: o.price_delta_cents,
          });
        }
      }
    }
    cart.addItem({
      product_id: product.id,
      product_slug: product.slug,
      product_name: variant ? `${product.name} — ${variant.name}` : product.name,
      variant_id: variant?.id,
      variant_name: variant?.name,
      unit_price_cents: unitPrice,
      qty: 1,
      photo_url: product.photo_urls?.[0],
      product_type: product.product_type ?? "physical",
      available_stock: stock,
      selected_options: selectedOptions.length ? selectedOptions : undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Tutup"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85svh] w-full flex-col rounded-t-3xl bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-4">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-neutral-900">{product.name}</p>
            <p className="text-sm text-neutral-500">Pilih opsi pesananmu</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {hasVariants && (
            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-800">Varian</p>
              <div className="grid grid-cols-2 gap-2">
                {variants.map((v) => {
                  const off = v.stock <= 0;
                  const on = v.id === variantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={off}
                      onClick={() => setVariantId(v.id)}
                      className={cn(
                        "flex flex-col items-start rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
                        on
                          ? "border-brand-500 bg-brand-50"
                          : "border-neutral-200 hover:border-brand-300",
                        off && "cursor-not-allowed opacity-40",
                      )}
                    >
                      <span className="text-sm font-medium text-neutral-900">{v.name}</span>
                      <span className="text-sm font-semibold text-brand-600">
                        {formatRupiah(v.price_cents)}
                      </span>
                      {off && <span className="text-xs text-neutral-400">Habis</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.id}>
              <p className="mb-2 text-sm font-semibold text-neutral-800">
                {g.name}
                <span className="ml-1.5 text-xs font-normal text-neutral-400">
                  {g.is_required ? "wajib" : "opsional"}
                  {g.selection === "multi" ? " · bisa pilih banyak" : ""}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {g.options.map((o) => {
                  const on = (selected[g.id] ?? []).includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOption(g.id, g.selection, o)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
                        on ? "border-brand-500 bg-brand-50" : "border-neutral-200 hover:border-brand-300",
                      )}
                    >
                      <span className="text-sm font-medium text-neutral-900">{o.name}</span>
                      {o.price_delta_cents !== 0 && (
                        <span className="shrink-0 text-xs font-semibold text-neutral-500">
                          {o.price_delta_cents > 0 ? "+" : ""}
                          {formatRupiah(o.price_delta_cents)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-100 p-4">
          <button
            type="button"
            onClick={add}
            disabled={blocked}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-5" aria-hidden />
            {outOfStock
              ? "Stok habis"
              : variantMissing
                ? "Pilih varian dulu"
                : missingRequired
                  ? "Lengkapi pilihan wajib"
                  : `Tambah · ${formatRupiah(unitPrice)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
