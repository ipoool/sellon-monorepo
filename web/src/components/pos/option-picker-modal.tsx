"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product, SelectedOption } from "@/lib/types";
import { usePOS } from "./pos-context";

type Props = {
  product: Product;
  onClose: () => void;
};

// POS picker shown when a tapped product needs a choice before adding to the
// cart: a variant (SKU with its own price + stock) and/or modifier option
// groups (price deltas + soft material consumption). Builds the POSCartItem
// and adds it to the cart.
export function OptionPickerModal({ product, onClose }: Props) {
  const { addToCart } = usePOS();
  const groups = product.modifiers ?? [];
  const variants = product.variants ?? [];
  const hasVariants = product.has_variants && variants.length > 0;
  const tracksStock = product.product_type !== "digital";
  const takeawayEnabled = product.takeaway_enabled;
  const takeawayCharge = product.takeaway_charge_cents ?? 0;
  const takeawayLabel = product.takeaway_material_name || "Take Away";

  const [serving, setServing] = useState<"dine_in" | "takeaway">("dine_in");
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      if (!g.id) continue;
      init[g.id] =
        g.selection === "single" && g.options[0]?.id ? [g.options[0].id] : [];
    }
    return init;
  });

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;
  const basePrice = selectedVariant ? selectedVariant.price_cents : product.price_cents;
  const lineStock = selectedVariant ? selectedVariant.stock : product.stock;

  const delta = groups.reduce((sum, g) => {
    const ids = selected[g.id ?? ""] ?? [];
    return (
      sum +
      g.options
        .filter((o) => o.id && ids.includes(o.id))
        .reduce((s, o) => s + o.price_delta_cents, 0)
    );
  }, 0);
  const variantUnmet = hasVariants && !variantId;
  const optionUnmet = groups.some(
    (g) => g.is_required && (selected[g.id ?? ""]?.length ?? 0) === 0,
  );
  const requiredUnmet = variantUnmet || optionUnmet;
  const unitCents = basePrice + delta;
  // Take-away packaging is billed as a separate cart line, but we surface its
  // charge in the confirm button so the cashier sees the true bill impact.
  const servingCharge = takeawayEnabled && serving === "takeaway" ? takeawayCharge : 0;

  const pickSingle = (gid: string, oid: string) =>
    setSelected((s) => ({ ...s, [gid]: [oid] }));
  const toggleMulti = (gid: string, oid: string) =>
    setSelected((s) => {
      const cur = s[gid] ?? [];
      return {
        ...s,
        [gid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid],
      };
    });

  const confirm = () => {
    if (requiredUnmet) return;
    const selected_options: SelectedOption[] = groups.flatMap((g) => {
      const ids = selected[g.id ?? ""] ?? [];
      return g.options
        .filter((o) => o.id && ids.includes(o.id))
        .map((o) => ({
          option_id: o.id!,
          group_name: g.name,
          option_name: o.name,
          price_delta_cents: o.price_delta_cents,
        }));
    });
    addToCart({
      product_id: product.id,
      variant_id: selectedVariant ? selectedVariant.id : null,
      product_name: product.name,
      variant_name: selectedVariant ? selectedVariant.name : undefined,
      product_type: product.product_type,
      unit_cents: unitCents,
      quantity: 1,
      photo_url: product.photo_urls?.[0],
      stock: lineStock,
      discounts: product.discounts,
      selected_options:
        selected_options.length > 0 ? selected_options : undefined,
      serving_type: takeawayEnabled ? serving : undefined,
      takeaway_charge_cents:
        takeawayEnabled && serving === "takeaway" ? takeawayCharge : undefined,
      takeaway_label:
        takeawayEnabled && serving === "takeaway" ? takeawayLabel : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-popout">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-neutral-900">
              {product.name}
            </h2>
            <p className="text-sm text-neutral-500">{formatRupiah(basePrice)}</p>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            aria-label="Tutup"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {hasVariants && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-neutral-800">
                Varian <span className="text-danger">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {variants.map((v) => {
                  const soldOut = tracksStock && v.stock <= 0;
                  const active = variantId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={soldOut}
                      onClick={() => setVariantId(v.id)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        active
                          ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                      )}
                    >
                      <span className="leading-snug">{v.name}</span>
                      <span className="mt-0.5 text-xs font-normal text-neutral-500">
                        {formatRupiah(v.price_cents)}
                        {tracksStock &&
                          (soldOut ? " · Stok habis" : ` · Stok ${v.stock}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {takeawayEnabled && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-neutral-800">
                Penyajian <span className="text-danger">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setServing("dine_in")}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    serving === "dine_in"
                      ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                      : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                  )}
                >
                  Dine In
                </button>
                <button
                  type="button"
                  onClick={() => setServing("takeaway")}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    serving === "takeaway"
                      ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                      : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                  )}
                >
                  <span>Take Away</span>
                  {takeawayCharge > 0 && (
                    <span className="text-xs font-normal text-neutral-500">
                      +{formatRupiah(takeawayCharge)} {takeawayLabel}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {groups.map((g) => {
            const ids = selected[g.id ?? ""] ?? [];
            return (
              <div key={g.id} className="mb-4">
                <p className="mb-2 text-sm font-medium text-neutral-800">
                  {g.name}{" "}
                  {g.is_required ? (
                    <span className="text-danger">*</span>
                  ) : (
                    <span className="text-xs font-normal text-neutral-400">
                      (opsional)
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => {
                    const active = !!o.id && ids.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() =>
                          g.id && o.id
                            ? g.selection === "single"
                              ? pickSingle(g.id, o.id)
                              : toggleMulti(g.id, o.id)
                            : undefined
                        }
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                        )}
                      >
                        {o.name}
                        {o.price_delta_cents > 0 && (
                          <span className="ml-1 text-xs text-neutral-500">
                            +{formatRupiah(o.price_delta_cents)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-neutral-200 p-3">
          <button
            onClick={confirm}
            disabled={requiredUnmet}
            className="w-full rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:bg-neutral-300"
          >
            {variantUnmet
              ? "Pilih varian dulu"
              : `Tambah — ${formatRupiah(unitCents + servingCharge)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
