"use client";

import { Box, Download, GraduationCap, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ProductTypeValue = "physical" | "digital" | "course";

const TYPES: { value: ProductTypeValue; icon: LucideIcon; title: string; desc: string }[] = [
  {
    value: "physical",
    icon: Box,
    title: "Fisik",
    desc: "Barang yang dikirim ke alamat pembeli (kaos, makanan, kerajinan, dll.).",
  },
  {
    value: "digital",
    icon: Download,
    title: "Digital",
    desc: "File / akses via link / kode (ebook, voucher, software).",
  },
  {
    value: "course",
    icon: GraduationCap,
    title: "Kursus",
    desc: "Kelas video online. Buyer akses lewat link + login OTP email.",
  },
];

// ProductTypeSelector is the shared "Tipe Produk" card. The selected type drives
// which form body (physical vs non-physical) the router renders.
export function ProductTypeSelector({
  value,
  onChange,
}: {
  value: ProductTypeValue;
  onChange: (v: ProductTypeValue) => void;
}) {
  return (
    <Card>
      <div className="mb-4">
        <h2 className="font-semibold text-neutral-900">Tipe Produk</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          Pilih jenis produk. Digital & kursus melewati ongkir & alamat
          pengiriman dan otomatis dikirim setelah pembayaran lunas.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {TYPES.map((opt) => {
          const active = value === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
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
                <p className="mt-1 text-xs leading-relaxed text-neutral-600">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
