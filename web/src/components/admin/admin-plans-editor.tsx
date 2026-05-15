"use client";

import { useState, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { Save, Loader2, Crown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatRupiah, formatRupiahShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  initial: PublicPlan[];
};

export function AdminPlansEditor({ initial }: Props) {
  const [plans, setPlans] = useState<PublicPlan[]>(() => initial);

  if (plans.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral-600">
          Tabel <code>plans</code> kosong. Pastikan migration{" "}
          <code>0018_plans</code> sudah jalan.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard
          key={plan.tier}
          plan={plan}
          onSaved={(updated) =>
            setPlans((prev) =>
              prev.map((p) => (p.tier === updated.tier ? updated : p)),
            )
          }
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  onSaved,
}: {
  plan: PublicPlan;
  onSaved: (p: PublicPlan) => void;
}) {
  const { refresh } = useRouter();
  const [name, setName] = useState(() => plan.name);
  // Edit fields hold *rupiah* (not cents) for human-friendly input.
  // Convert at save time.
  const [monthlyRupiah, setMonthlyRupiah] = useState(
    String(Math.round(plan.monthly_price_cents / 100)),
  );
  const [yearlyRupiah, setYearlyRupiah] = useState(
    String(Math.round(plan.yearly_price_cents / 100)),
  );
  // Limit fields. Empty string is the user-facing "unlimited" state;
  // we send -1 to the API on save.
  const [productLimit, setProductLimit] = useState(() =>
    limitToInput(plan.product_limit),
  );
  const [staffLimit, setStaffLimit] = useState(() =>
    limitToInput(plan.staff_limit),
  );
  const [orderLimit, setOrderLimit] = useState(() =>
    limitToInput(plan.order_monthly_limit),
  );
  const [promoLimit, setPromoLimit] = useState(() =>
    limitToInput(plan.promo_limit),
  );
  // Marketing copy. features is edited as one-bullet-per-line textarea
  // for simplicity — converted to/from string[] at I/O boundaries.
  const [description, setDescription] = useState(() => plan.description);
  const [featuresText, setFeaturesText] = useState(() =>
    plan.features.join("\n"),
  );
  const [ctaLabel, setCtaLabel] = useState(() => plan.cta_label);
  const [periodMonthlyLabel, setPeriodMonthlyLabel] = useState(
    () => plan.period_monthly_label,
  );
  const [periodYearlyLabel, setPeriodYearlyLabel] = useState(
    () => plan.period_yearly_label,
  );
  const [highlighted, setHighlighted] = useState(() => plan.highlighted);
  const [busy, setBusy] = useState(false);
  const monthlyCents = Math.max(
    0,
    Math.round(parseFloat(monthlyRupiah || "0") * 100),
  );
  const yearlyCents = Math.max(
    0,
    Math.round(parseFloat(yearlyRupiah || "0") * 100),
  );

  const productLimitValue = inputToLimit(productLimit);
  const staffLimitValue = inputToLimit(staffLimit);
  const orderLimitValue = inputToLimit(orderLimit);
  const promoLimitValue = inputToLimit(promoLimit);
  const featuresValue = parseFeatures(featuresText);

  const dirty =
    name !== plan.name ||
    monthlyCents !== plan.monthly_price_cents ||
    yearlyCents !== plan.yearly_price_cents ||
    productLimitValue !== plan.product_limit ||
    staffLimitValue !== plan.staff_limit ||
    orderLimitValue !== plan.order_monthly_limit ||
    promoLimitValue !== plan.promo_limit ||
    description !== plan.description ||
    !sameArray(featuresValue, plan.features) ||
    ctaLabel !== plan.cta_label ||
    periodMonthlyLabel !== plan.period_monthly_label ||
    periodYearlyLabel !== plan.period_yearly_label ||
    highlighted !== plan.highlighted;

  const yearlyDiscount =
    monthlyCents > 0 && yearlyCents > 0
      ? Math.round(((monthlyCents - yearlyCents) / monthlyCents) * 100)
      : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);    try {
      const res = await fetch(`${apiBase}/api/v1/admin/plans/${plan.tier}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          monthly_price_cents: monthlyCents,
          yearly_price_cents: yearlyCents,
          product_limit: productLimitValue,
          staff_limit: staffLimitValue,
          order_monthly_limit: orderLimitValue,
          promo_limit: promoLimitValue,
          description: description.trim(),
          features: featuresValue,
          cta_label: ctaLabel.trim(),
          period_monthly_label: periodMonthlyLabel.trim(),
          period_yearly_label: periodYearlyLabel.trim(),
          highlighted,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved(data.plan);
      showSuccess("Tersimpan");      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-neutral-500">
            {plan.tier}
          </p>
          <h2 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-neutral-900">
            {plan.name}
          </h2>
        </div>
        {plan.tier !== "free" && (
          <Badge variant="warning" className="gap-1">
            <Crown className="size-3" aria-hidden />
            Berbayar
          </Badge>
        )}
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${plan.tier}`}>Nama paket</Label>
          <Input
            id={`name-${plan.tier}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`monthly-${plan.tier}`}>
            Harga bulanan (Rp)
          </Label>
          <Input
            id={`monthly-${plan.tier}`}
            type="number"
            min={0}
            step={1000}
            value={monthlyRupiah}
            onChange={(e) => setMonthlyRupiah(e.target.value)}
          />
          <p className="text-xs text-neutral-500">
            Tampil di landing &amp; tagihan checkout = {formatRupiah(monthlyCents)} ({formatRupiahShort(monthlyCents)})
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`yearly-${plan.tier}`}>
            Harga per bulan jika tahunan (Rp)
          </Label>
          <Input
            id={`yearly-${plan.tier}`}
            type="number"
            min={0}
            step={1000}
            value={yearlyRupiah}
            onChange={(e) => setYearlyRupiah(e.target.value)}
          />
          <p className="text-xs text-neutral-500">
            Per bulan - tagihan tahunan = harga ini × 12.{" "}
            {yearlyDiscount !== null && yearlyDiscount > 0 && (
              <span className="font-medium text-success">
                Diskon {yearlyDiscount}%
              </span>
            )}
            {yearlyDiscount !== null && yearlyDiscount <= 0 && (
              <span className="font-medium text-warning">
                Tidak ada diskon (yearly ≥ monthly)
              </span>
            )}
          </p>
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Limit & Kuota
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            Kosongkan untuk <strong>tanpa batas</strong>. Angka 0 = tidak boleh
            sama sekali.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <LimitField
              id={`product-limit-${plan.tier}`}
              label="Maks. produk"
              value={productLimit}
              onChange={setProductLimit}
              disabled={busy}
            />
            <LimitField
              id={`staff-limit-${plan.tier}`}
              label="Maks. staf (termasuk owner)"
              value={staffLimit}
              onChange={setStaffLimit}
              disabled={busy}
            />
            <LimitField
              id={`order-limit-${plan.tier}`}
              label="Maks. pesanan / bulan"
              value={orderLimit}
              onChange={setOrderLimit}
              disabled={busy}
            />
            <LimitField
              id={`promo-limit-${plan.tier}`}
              label="Maks. kode promo"
              value={promoLimit}
              onChange={setPromoLimit}
              disabled={busy}
            />
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Tampilan di Landing Page
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            Copy yang tampil di kartu harga landing. Bisa diubah tanpa
            deploy ulang.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`description-${plan.tier}`} className="text-xs">
                Deskripsi singkat
              </Label>
              <textarea
                id={`description-${plan.tier}`}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
                className={cn(
                  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`features-${plan.tier}`} className="text-xs">
                Daftar fitur (1 per baris)
              </Label>
              <textarea
                id={`features-${plan.tier}`}
                rows={Math.max(3, featuresValue.length + 1)}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                disabled={busy}
                placeholder="Contoh: Template pesan WhatsApp"
                className={cn(
                  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
              <p className="text-xs text-neutral-500">
                Bullet kuota (produk, pesanan, staf, promo) di-generate
                otomatis dari Limit di atas — tidak perlu diketik manual.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`cta-${plan.tier}`} className="text-xs">
                Label tombol CTA
              </Label>
              <Input
                id={`cta-${plan.tier}`}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                disabled={busy}
                placeholder="Pilih Paket"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`period-monthly-${plan.tier}`}
                  className="text-xs"
                >
                  Label periode bulanan
                </Label>
                <Input
                  id={`period-monthly-${plan.tier}`}
                  value={periodMonthlyLabel}
                  onChange={(e) => setPeriodMonthlyLabel(e.target.value)}
                  disabled={busy}
                  placeholder="/ bulan"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`period-yearly-${plan.tier}`}
                  className="text-xs"
                >
                  Label periode tahunan
                </Label>
                <Input
                  id={`period-yearly-${plan.tier}`}
                  value={periodYearlyLabel}
                  onChange={(e) => setPeriodYearlyLabel(e.target.value)}
                  disabled={busy}
                  placeholder="/ bulan, ditagih tahunan"
                />
              </div>
            </div>

            <label
              htmlFor={`highlighted-${plan.tier}`}
              className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-neutral-900">
                  Tandai sebagai paling populer
                </span>
                <span className="text-xs text-neutral-500">
                  Kartu ini dapat highlight + badge di landing page.
                </span>
              </div>
              <Switch
                id={`highlighted-${plan.tier}`}
                checked={highlighted}
                onChange={(e) => setHighlighted(e.target.checked)}
                disabled={busy}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
          <Button
            type="submit"
            size="sm"
            disabled={busy || !dirty || !name.trim()}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="size-3.5" aria-hidden />
            )}
            {busy ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LimitField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        placeholder="Tanpa batas"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

// limitToInput renders the API value (-1 = unlimited) as a string for
// the <input>. Empty string means "unlimited".
function limitToInput(v: number): string {
  if (v < 0) return "";
  return String(v);
}

// inputToLimit converts the user-typed string back to the API integer.
// Empty / non-numeric → -1 (unlimited). Negative numbers also collapse
// to -1; the backend additionally normalizes.
function inputToLimit(s: string): number {
  const trimmed = s.trim();
  if (trimmed === "") return -1;
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return -1;
  return n;
}

// parseFeatures splits a textarea value (one bullet per line) into a
// trimmed string[]. Empty lines are dropped.
function parseFeatures(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
