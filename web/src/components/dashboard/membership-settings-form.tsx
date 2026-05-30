"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award, Save, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import type { MembershipTier } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Draft = {
  name: string;
  minSpentRupiah: number;
  pointMultiplier: number;
  discountPercent: number;
  isActive: boolean;
};

const SUGGESTED: Draft[] = [
  { name: "Silver", minSpentRupiah: 0, pointMultiplier: 1, discountPercent: 0, isActive: true },
  { name: "Gold", minSpentRupiah: 1000000, pointMultiplier: 1.5, discountPercent: 5, isActive: true },
  { name: "Platinum", minSpentRupiah: 5000000, pointMultiplier: 2, discountPercent: 10, isActive: true },
];

export function MembershipSettingsForm({ initial }: { initial: MembershipTier[] }) {
  const router = useRouter();
  const [tiers, setTiers] = useState<Draft[]>(() =>
    initial.length > 0
      ? initial.map((t) => ({
          name: t.name,
          minSpentRupiah: Math.floor(t.min_spent_cents / 100),
          pointMultiplier: t.point_multiplier,
          discountPercent: t.discount_percent,
          isActive: t.is_active,
        }))
      : [],
  );
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<Draft>) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => setTiers((ts) => ts.filter((_, j) => j !== i));
  const add = () =>
    setTiers((ts) => [
      ...ts,
      { name: "", minSpentRupiah: 0, pointMultiplier: 1, discountPercent: 0, isActive: true },
    ]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/membership/tiers`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tiers: tiers
            .filter((t) => t.name.trim())
            .map((t) => ({
              name: t.name.trim(),
              min_spent_cents: Math.max(0, Math.round(t.minSpentRupiah)) * 100,
              point_multiplier: Math.max(1, t.pointMultiplier),
              discount_percent: Math.max(0, Math.min(100, Math.round(t.discountPercent))),
              is_active: t.isActive,
            })),
        }),
      });
      if (res.status === 402) {
        showError("Fitur Membership hanya untuk paket Bisnis");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal menyimpan");
        return;
      }
      showSuccess("Tier membership disimpan");
      router.refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Award className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Tier Membership</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Pelanggan otomatis naik tier berdasarkan total belanja. Tiap tier bisa
              kasih <strong>bonus poin</strong> (multiplier) dan <strong>diskon member</strong> otomatis di kasir.
            </p>
          </div>
        </div>
      </Card>

      {tiers.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-sm text-neutral-600">Belum ada tier. Mulai dari contoh atau tambah manual.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTiers(SUGGESTED)}>
              Pakai contoh (Silver/Gold/Platinum)
            </Button>
            <Button size="sm" onClick={add}>
              <Plus className="size-4" aria-hidden />
              Tambah Tier
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 text-neutral-500">
                <tr>
                  <th className="py-2 text-left font-medium">Nama Tier</th>
                  <th className="py-2 text-left font-medium">Min. Belanja (Rp)</th>
                  <th className="py-2 text-left font-medium">Bonus Poin (×)</th>
                  <th className="py-2 text-left font-medium">Diskon (%)</th>
                  <th className="py-2 text-center font-medium">Aktif</th>
                  <th className="w-px py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tiers.map((t, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-2">
                      <Input
                        value={t.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        placeholder="mis. Gold"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        inputMode="numeric"
                        value={t.minSpentRupiah ? t.minSpentRupiah.toLocaleString("id-ID") : ""}
                        onChange={(e) =>
                          update(i, {
                            minSpentRupiah: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0,
                          })
                        }
                        placeholder="0"
                        className="text-right"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        min={1}
                        step={0.5}
                        value={t.pointMultiplier}
                        onChange={(e) =>
                          update(i, { pointMultiplier: parseFloat(e.target.value) || 1 })
                        }
                        className="w-20 text-right"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={t.discountPercent || ""}
                        onChange={(e) =>
                          update(i, { discountPercent: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-20 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 text-center">
                      <Switch
                        checked={t.isActive}
                        onChange={(e) => update(i, { isActive: e.target.checked })}
                      />
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="flex size-9 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                        aria-label="Hapus tier"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Button type="button" size="sm" variant="outline" onClick={add}>
              <Plus className="size-4" aria-hidden />
              Tambah Tier
            </Button>
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          <Save className="size-4" aria-hidden />
          {saving ? "Menyimpan..." : "Simpan Tier"}
        </Button>
      </div>
    </div>
  );
}
