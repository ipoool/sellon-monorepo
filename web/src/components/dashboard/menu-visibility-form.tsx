"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Truck,
  Download,
  Boxes,
  Loader2,
  Save,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Caps = { pos: boolean; reseller: boolean; digital: boolean; materials: boolean };

const ROWS: { key: keyof Caps; label: string; desc: string; icon: LucideIcon }[] = [
  { key: "pos", label: "Kasir POS", desc: "Buka kasir, shift, struk thermal, laporan POS", icon: ShoppingCart },
  { key: "reseller", label: "Program Reseller", desc: "Supplier, order dropship, katalog reseller", icon: Truck },
  { key: "digital", label: "Unduhan Digital", desc: "Kelola produk digital (ebook, voucher, file)", icon: Download },
  { key: "materials", label: "Bahan Baku & Pembelian", desc: "Inventory bahan baku + purchase order", icon: Boxes },
];

export function MenuVisibilityForm({ initial }: { initial: Store | null }) {
  const { refresh } = useRouter();
  const [caps, setCaps] = useState<Caps>({
    pos: initial?.cap_pos ?? true,
    reseller: initial?.cap_reseller ?? true,
    digital: initial?.cap_digital ?? true,
    materials: initial?.cap_materials ?? true,
  });
  const [saving, setSaving] = useState(false);

  function toggle(key: keyof Caps) {
    setCaps((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/menu-caps`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cap_pos: caps.pos,
          cap_reseller: caps.reseller,
          cap_digital: caps.digital,
          cap_materials: caps.materials,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Gagal menyimpan");
        return;
      }
      showSuccess("Tampilan menu tersimpan");
      refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">Tampilan Menu</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pilih fitur tambahan yang muncul di sidebar. Matikan yang belum kamu
          pakai biar dasbor lebih ringkas — bisa diaktifkan lagi kapan saja.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {ROWS.map(({ key, label, desc, icon: Icon }) => (
          <Card key={key}>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="flex items-center gap-2.5">
                <Icon className="size-5 text-brand-600" aria-hidden />
                <span>
                  <span className="block font-semibold text-neutral-900">{label}</span>
                  <span className="block text-sm text-neutral-500">{desc}</span>
                </span>
              </span>
              <Switch checked={caps[key]} onChange={() => toggle(key)} />
            </label>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
        Menu inti (Dasbor, Pesanan, Produk, Pelanggan, Promo, Laporan, Pengaturan)
        selalu tampil dan tidak bisa disembunyikan. Mematikan menu di sini hanya
        menyembunyikannya — datamu tetap aman.
      </div>

      <div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
