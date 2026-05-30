"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatRupiah } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Config = {
  enabled: boolean;
  earn_rate_cents: number;
  redeem_rate_cents: number;
};

export function LoyaltySettingsForm({ initial }: { initial: Config }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  // Display in rupiah (config stored in cents).
  const [earnRate, setEarnRate] = useState<number>(initial.earn_rate_cents / 100);
  const [redeemRate, setRedeemRate] = useState<number>(initial.redeem_rate_cents / 100);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/loyalty/config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          earn_rate_cents: Math.max(1, earnRate) * 100,
          redeem_rate_cents: Math.max(1, redeemRate) * 100,
        }),
      });
      if (res.status === 402) {
        showError("Fitur Loyalty hanya untuk paket Bisnis");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal menyimpan");
        return;
      }
      showSuccess("Pengaturan loyalty disimpan");
      router.refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  // Example calculation for UX clarity.
  const exampleSpend = 100000; // Rp 100rb
  const examplePoints = Math.floor(exampleSpend / earnRate);
  const exampleRedeemDiscount = 50 * redeemRate; // 50 points

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900">Aktifkan Loyalty Point</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Pelanggan kamu otomatis dapat poin setiap belanja di POS, dan bisa pakai poin sebagai diskon.
              </p>
            </div>
          </div>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </div>
      </Card>

      {enabled && (
        <>
          <Card>
            <h3 className="mb-4 font-semibold text-neutral-900">Earn Rate (dapat poin)</h3>
            <p className="mb-3 text-sm text-neutral-600">
              Berapa rupiah yang harus dibelanjakan untuk dapat <strong>1 poin</strong>?
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">Setiap belanja</span>
              <div className="relative w-40">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">Rp</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={earnRate > 0 ? earnRate.toLocaleString("id-ID") : ""}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setEarnRate(digits === "" ? 0 : parseInt(digits, 10));
                  }}
                  className="pl-10 text-right"
                />
              </div>
              <span className="text-sm text-neutral-500">→ dapat 1 poin</span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Contoh: belanja {formatRupiah(exampleSpend * 100)} → dapat <strong>{examplePoints} poin</strong>
            </p>
          </Card>

          <Card>
            <h3 className="mb-4 font-semibold text-neutral-900">Redeem Rate (pakai poin)</h3>
            <p className="mb-3 text-sm text-neutral-600">
              Berapa nilai <strong>1 poin</strong> saat ditukar jadi diskon?
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">1 poin</span>
              <span className="text-sm text-neutral-500">=</span>
              <div className="relative w-40">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">Rp</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={redeemRate > 0 ? redeemRate.toLocaleString("id-ID") : ""}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setRedeemRate(digits === "" ? 0 : parseInt(digits, 10));
                  }}
                  className="pl-10 text-right"
                />
              </div>
              <span className="text-sm text-neutral-500">diskon</span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Contoh: pakai 50 poin → diskon <strong>{formatRupiah(exampleRedeemDiscount * 100)}</strong>
            </p>
          </Card>

          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            💡 <strong>Tips:</strong> Earn rate biasanya lebih besar dari redeem rate, supaya
            sistem poin tidak rugi untuk toko. Misal: earn Rp 1.000 = 1 poin, redeem 1 poin = Rp 100.
            Artinya pelanggan dapat <em>cashback efektif 10%</em>.
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          <Save className="size-4" aria-hidden />
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </Button>
      </div>
    </form>
  );
}
