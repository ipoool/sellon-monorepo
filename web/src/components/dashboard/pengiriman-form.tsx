"use client";

import { useState, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { Save, Truck, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CityPicker } from "@/components/dashboard/city-picker";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Couriers offered to the seller. RajaOngkir-supported codes are tagged
// so the seller knows which ones return real prices vs. estimates from
// the built-in zone table.
const couriers: {
  code: string;
  label: string;
  service: string;
  rajaongkir: boolean;
}[] = [
  { code: "jne", label: "JNE", service: "REG / YES / OKE", rajaongkir: true },
  { code: "tiki", label: "TIKI", service: "REG / ECO / ONS", rajaongkir: true },
  { code: "pos", label: "POS Indonesia", service: "Reguler / Kilat", rajaongkir: true },
  { code: "jnt", label: "J&T Express", service: "EZ", rajaongkir: false },
  { code: "sicepat", label: "SiCepat", service: "REG", rajaongkir: false },
  { code: "anteraja", label: "AnterAja", service: "REG", rajaongkir: false },
  { code: "gosend", label: "GoSend", service: "Same Day", rajaongkir: false },
  { code: "grabexpress", label: "GrabExpress", service: "Same Day", rajaongkir: false },
];

type Props = {
  initial: Store;
};

export function PengirimanForm({ initial }: Props) {
  const { refresh } = useRouter();
  const [originCityID, setOriginCityID] = useState(
    initial.shipping_origin_city_id ?? "",
  );
  const [originCityName, setOriginCityName] = useState(
    initial.shipping_origin_city_name || initial.shipping_origin_city || "",
  );
  const [originCityFallback, setOriginCityFallback] = useState(
    initial.shipping_origin_city ?? "",
  );
  const [enabled, setEnabled] = useState<Set<string>>(() => {
    const list = Array.isArray(initial.enabled_couriers) ? initial.enabled_couriers : [];
    if (list.length === 0) return new Set(couriers.map((c) => c.code));
    return new Set(list);
  });
  const [thresholdRp, setThresholdRp] = useState<string>(() =>
    initial.free_shipping_threshold_cents
      ? String(initial.free_shipping_threshold_cents / 100)
      : "0",
  );
  const [pending, setPending] = useState(false);
  function toggle(code: string, on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    // Empty list means "all" - keeps DB cleaner + future-proofs courier
    // additions.
    const list =
      enabled.size === couriers.length ? [] : Array.from(enabled.values());

    try {
      const res = await fetch(`${apiBase}/api/v1/store/shipping`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_origin_city: originCityFallback.trim(),
          shipping_origin_city_id: originCityID,
          shipping_origin_city_name: originCityName,
          enabled_couriers: list,
          free_shipping_threshold_cents: Math.max(
            0,
            Math.round(parseFloat(thresholdRp || "0") * 100),
          ),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showSuccess("Tersimpan");      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  const hasRajaOngkirOrigin = !!originCityID;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Asal Pengiriman</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Kota asal paket. Saat dipilih dari daftar RajaOngkir, ongkir di
            checkout dihitung real-time. Kalau tidak, pakai estimasi tabel
            bawaan SellOn.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:max-w-md">
          <CityPicker
            label="Kota / Kabupaten Asal"
            placeholder="Cari (mis. Yogyakarta)…"
            selectedID={originCityID}
            selectedName={originCityName}
            onChange={(id, name) => {
              setOriginCityID(id);
              setOriginCityName(name);
              if (name) setOriginCityFallback(name);
            }}
            description="Hasil pencarian dari RajaOngkir. Saat tidak terkonfigurasi, isi manual di bawah."
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="origin_city">Nama kota (fallback)</Label>
            <Input
              id="origin_city"
              value={originCityFallback}
              onChange={(e) => setOriginCityFallback(e.target.value)}
              placeholder={initial.city || "Mis. Yogyakarta"}
            />
            <p className="text-xs text-neutral-500">
              Dipakai oleh tabel bawaan SellOn (zone-based) saat RajaOngkir
              tidak aktif.
            </p>
          </div>
        </div>
        {hasRajaOngkirOrigin && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-neutral-800">
            <Info className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <p>
              Asal terhubung ke RajaOngkir (id <code>{originCityID}</code>) -
              ongkir JNE/TIKI/POS akan dihitung real-time saat pembeli pilih
              kota tujuan.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Kurir Aktif</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Pilih kurir yang muncul di checkout pembeli. Kurir bertanda{" "}
            <Badge variant="success" className="text-[10px]">
              Live
            </Badge>{" "}
            menarik harga real-time dari RajaOngkir saat asal & tujuan
            terhubung; sisanya pakai estimasi tabel bawaan.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {couriers.map((c) => {
            const active = enabled.has(c.code);
            return (
              <li
                key={c.code}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Truck className="size-4 text-neutral-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {c.label}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {c.service}
                      <span className="mx-1.5 text-neutral-300">•</span>
                      {c.rajaongkir ? (
                        <Badge variant="success" className="text-[10px]">
                          Live (RajaOngkir)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Estimasi
                        </Badge>
                      )}
                    </p>
                  </div>
                </div>
                <Switch
                  size="sm"
                  checked={active}
                  onChange={(e) => toggle(c.code, e.target.checked)}
                  aria-label={`Aktifkan kurir ${c.label}`}
                />
              </li>
            );
          })}
        </ul>
        {enabled.size === 0 && (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-neutral-700">
            Tidak ada kurir aktif - pembeli tidak bisa pilih ongkir di checkout.
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Gratis Ongkir</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Pesanan dengan subtotal melewati ambang ini otomatis dapat ongkir
            0 di checkout. Set 0 untuk menonaktifkan.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor="threshold">Minimum Belanja (Rp)</Label>
          <Input
            id="threshold"
            type="number"
            min={0}
            step={1000}
            value={thresholdRp}
            onChange={(e) => setThresholdRp(e.target.value)}
            placeholder="0"
          />
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
                            </span>
        <Button type="submit" disabled={pending}>
          <Save className="size-4" aria-hidden />
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
