"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const couriers: {
  code: string;
  label: string;
  service: string;
  zone: string;
}[] = [
  { code: "jne", label: "JNE", service: "REG / YES", zone: "Nasional" },
  { code: "jnt", label: "J&T Express", service: "EZ", zone: "Nasional" },
  { code: "sicepat", label: "SiCepat", service: "REG", zone: "Nasional" },
  { code: "anteraja", label: "AnterAja", service: "REG", zone: "Nasional" },
  { code: "gosend", label: "GoSend", service: "Same Day", zone: "Same city" },
  {
    code: "grabexpress",
    label: "GrabExpress",
    service: "Same Day",
    zone: "Same city",
  },
];

type Props = {
  initial: Store;
};

export function PengirimanForm({ initial }: Props) {
  const router = useRouter();
  const [originCity, setOriginCity] = useState(
    initial.shipping_origin_city ?? "",
  );
  const [enabled, setEnabled] = useState<Set<string>>(() => {
    const list = initial.enabled_couriers ?? [];
    // Empty = "all", which we represent as the full set so the UI is honest
    // about what's currently shown to buyers.
    if (list.length === 0) return new Set(couriers.map((c) => c.code));
    return new Set(list);
  });
  const [thresholdRp, setThresholdRp] = useState<string>(() =>
    initial.free_shipping_threshold_cents
      ? String(initial.free_shipping_threshold_cents / 100)
      : "0",
  );
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSaved(false);
    setError(null);

    // If everything is enabled, send empty list (= "all allowed", future-proof
    // for couriers we add later).
    const list =
      enabled.size === couriers.length ? [] : Array.from(enabled.values());

    try {
      const res = await fetch(`${apiBase}/api/v1/store/shipping`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_origin_city: originCity.trim(),
          enabled_couriers: list,
          free_shipping_threshold_cents: Math.max(
            0,
            Math.round(parseFloat(thresholdRp || "0") * 100),
          ),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Asal Pengiriman</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Kota asal paket. Dipakai untuk hitung ongkir dan zona kurir.
            Kosongkan untuk pakai kota toko ({initial.city || "—"}).
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor="origin_city">Kota Asal</Label>
          <Input
            id="origin_city"
            value={originCity}
            onChange={(e) => setOriginCity(e.target.value)}
            placeholder={initial.city || "Mis. Yogyakarta"}
          />
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Kurir Aktif</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Pilih kurir yang muncul di checkout pembeli. Tarif dihitung otomatis
            berdasarkan zona dan berat paket.
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
                      <Badge variant="outline" className="text-[10px]">
                        {c.zone}
                      </Badge>
                    </p>
                  </div>
                </div>
                <Switch
                  size="sm"
                  checked={active}
                  onChange={(e) => toggle(c.code, e.target.checked)}
                />
              </li>
            );
          })}
        </ul>
        {enabled.size === 0 && (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-neutral-700">
            Tidak ada kurir aktif — pembeli tidak bisa pilih ongkir di checkout.
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-neutral-900">Gratis Ongkir</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Pesanan dengan subtotal melewati ambang ini akan otomatis dapat
            ongkir 0 di checkout. Set 0 untuk menonaktifkan.
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
          {saved && (
            <span className="font-medium text-success">✓ Tersimpan</span>
          )}
          {error && <span className="font-medium text-danger">{error}</span>}
        </span>
        <Button type="submit" disabled={pending}>
          <Save className="size-4" aria-hidden />
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
