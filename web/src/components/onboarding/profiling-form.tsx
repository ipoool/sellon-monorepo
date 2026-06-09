"use client";

import { useState } from "react";
import {
  Globe,
  Store,
  UtensilsCrossed,
  Truck,
  Download,
  Boxes,
  ShoppingCart,
  Check,
  Loader2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ProfilingCaps = {
  pos: boolean;
  reseller: boolean;
  digital: boolean;
  materials: boolean;
};
export type ProfilingResult = { caps: ProfilingCaps; seller_types: string };

// Business types → which menu capabilities they imply. One type can enable
// several caps (e.g. F&B → POS + bahan baku). Menus are derived purely from the
// chosen types; fine-tuning per-menu happens later in Pengaturan → Tampilan Menu.
const BUSINESS_TYPES: {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  caps: Partial<ProfilingCaps>;
}[] = [
  { id: "online", label: "Toko online", desc: "Jualan lewat storefront / link", icon: Globe, caps: {} },
  { id: "fisik", label: "Toko fisik / kasir", desc: "Punya outlet, terima walk-in", icon: Store, caps: { pos: true } },
  { id: "fnb", label: "Restoran / F&B", desc: "Makanan & minuman, kelola bahan baku", icon: UtensilsCrossed, caps: { pos: true, materials: true } },
  { id: "reseller", label: "Reseller / dropship", desc: "Jual produk dari supplier lain", icon: Truck, caps: { reseller: true } },
  { id: "digital", label: "Produk digital", desc: "Ebook, voucher, file unduhan", icon: Download, caps: { digital: true } },
  { id: "produksi", label: "Produksi / manufaktur", desc: "Bikin produk dari bahan baku", icon: Boxes, caps: { materials: true } },
];

// Cap → chip metadata for the read-only "menu tambahan" preview.
const CAP_META: { key: keyof ProfilingCaps; label: string; icon: LucideIcon }[] = [
  { key: "pos", label: "Kasir POS", icon: ShoppingCart },
  { key: "reseller", label: "Program Reseller", icon: Truck },
  { key: "digital", label: "Unduhan Digital", icon: Download },
  { key: "materials", label: "Bahan Baku & Pembelian", icon: Boxes },
];

function deriveCaps(typeIds: Set<string>): ProfilingCaps {
  const c: ProfilingCaps = { pos: false, reseller: false, digital: false, materials: false };
  for (const t of BUSINESS_TYPES) {
    if (typeIds.has(t.id)) {
      for (const k of Object.keys(t.caps) as (keyof ProfilingCaps)[]) {
        if (t.caps[k]) c[k] = true;
      }
    }
  }
  return c;
}

export function ProfilingForm({
  submitting,
  onSubmit,
  submitLabel = "Simpan",
}: {
  submitting?: boolean;
  onSubmit: (r: ProfilingResult) => void;
  submitLabel?: string;
}) {
  const [types, setTypes] = useState<Set<string>>(new Set());
  // Menus are derived straight from the selected business types — no separate
  // toggle state. Recomputed each render (cheap).
  const caps = deriveCaps(types);
  const extras = CAP_META.filter(({ key }) => caps[key]);

  function toggleType(id: string) {
    const next = new Set(types);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTypes(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="font-semibold text-neutral-900">Jenis usahamu apa?</h3>
        <p className="mt-0.5 text-sm text-neutral-500">
          Pilih semua yang sesuai — menu di sidebar kami sesuaikan otomatis.
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {BUSINESS_TYPES.map(({ id, label, desc, icon: Icon }) => {
            const selected = types.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleType(id)}
                aria-pressed={selected}
                className={cn(
                  "relative flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors",
                  selected
                    ? "border-brand-500 bg-brand-50"
                    : "border-neutral-200 bg-white hover:border-neutral-300",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    selected ? "bg-brand-100 text-brand-700" : "bg-neutral-100 text-neutral-500",
                  )}
                >
                  <Icon className="size-4.5" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{desc}</p>
                </div>
                {selected && (
                  <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-brand-600 text-white">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Read-only preview of the extra menus that will appear from the chosen
          types. No toggles — fine-tuning lives in Pengaturan → Tampilan Menu. */}
      {extras.length > 0 && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3">
          <p className="text-xs font-medium text-neutral-600">
            Menu tambahan yang akan muncul:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extras.map(({ key, label, icon: Icon }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200"
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-400">
        Menu inti (Dasbor, Pesanan, Produk, Pelanggan, Promo, Laporan, Pengaturan)
        selalu tampil. Bisa diatur lagi kapan saja di Pengaturan → Tampilan Menu.
      </p>

      <Button
        type="button"
        size="lg"
        disabled={submitting}
        onClick={() => onSubmit({ caps, seller_types: Array.from(types).join(",") })}
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="size-4" aria-hidden />
        )}
        {submitting ? "Menyimpan…" : submitLabel}
      </Button>
    </div>
  );
}
