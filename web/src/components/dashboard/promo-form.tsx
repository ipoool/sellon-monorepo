"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Promo, PromoType } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  initial?: Promo;
  // When set, called instead of the default router.push after save/delete —
  // dialog hosts use this to close themselves and refresh the parent list.
  onSuccess?: () => void;
};

// Convert ISO datetime → "YYYY-MM-DD" for <input type="date">
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function PromoForm({ initial, onSuccess }: Props) {
  const router = useRouter();
  const isEdit = !!initial;

  function done() {
    if (onSuccess) {
      onSuccess();
      router.refresh();
      return;
    }
    router.push("/dasbor/promo");
    router.refresh();
  }

  const [code, setCode] = useState(initial?.code ?? "");
  const [type, setType] = useState<PromoType>(initial?.type ?? "percent");
  const [value, setValue] = useState<string>(
    initial ? String(initial.type === "fixed" ? initial.value / 100 : initial.value) : "",
  );
  const [minPurchase, setMinPurchase] = useState<string>(
    initial ? String(initial.min_purchase_cents / 100) : "",
  );
  const [maxUsage, setMaxUsage] = useState<string>(
    initial ? String(initial.max_usage) : "0",
  );
  const [startsAt, setStartsAt] = useState(isoToDateInput(initial?.starts_at));
  const [expiresAt, setExpiresAt] = useState(isoToDateInput(initial?.expires_at));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    // For percent: value is integer 1-100. For fixed: rupiah → cents.
    let valueOut = 0;
    if (type === "percent") {
      valueOut = parseInt(value || "0", 10);
    } else if (type === "fixed") {
      valueOut = Math.round(parseFloat(value || "0") * 100);
    }

    const body = {
      code: code.trim(),
      type,
      value: valueOut,
      min_purchase_cents: Math.round(parseFloat(minPurchase || "0") * 100),
      max_usage: parseInt(maxUsage || "0", 10),
      starts_at: startsAt || null,
      expires_at: expiresAt || null,
      is_active: isActive,
    };

    try {
      const url = isEdit
        ? `${apiBase}/api/v1/promos/${initial.id}`
        : `${apiBase}/api/v1/promos`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan");
      setPending(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    const ok = window.confirm(
      `Hapus promo "${initial.code}"? Data pemakaian historis tidak ikut terhapus tapi kode ini tidak bisa dipakai lagi.`,
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/promos/${initial.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus");
      setDeleting(false);
    }
  }

  const showValueField = type !== "free_shipping";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <h2 className="text-base font-semibold text-neutral-900">Detail Promo</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Kode akan otomatis di-uppercase. Pelanggan memasukkan kode ini saat checkout.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="code">Kode Promo *</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="HEMAT10"
              required
              maxLength={30}
              className="font-mono uppercase"
            />
            <p className="text-xs text-neutral-500">
              Hindari spasi & karakter spesial. Contoh: <code>HEMAT10</code>,{" "}
              <code>GRATISONGKIR</code>.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Tipe Diskon *</Label>
            <Select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as PromoType)}
            >
              <option value="percent">Persentase (%)</option>
              <option value="fixed">Nominal (Rp)</option>
              <option value="free_shipping">Gratis Ongkir</option>
            </Select>
          </div>

          {showValueField && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="value">
                {type === "percent" ? "Persentase (%)" : "Nominal (Rp)"} *
              </Label>
              <Input
                id="value"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min={type === "percent" ? 1 : 1}
                max={type === "percent" ? 100 : undefined}
                step={type === "percent" ? 1 : 1000}
                placeholder={type === "percent" ? "10" : "10000"}
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="min_purchase">Minimum Belanja (Rp)</Label>
            <Input
              id="min_purchase"
              type="number"
              value={minPurchase}
              onChange={(e) => setMinPurchase(e.target.value)}
              min={0}
              step={1000}
              placeholder="0"
            />
            <p className="text-xs text-neutral-500">
              Kosongkan / 0 berarti tanpa minimum.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max_usage">Kuota Pemakaian</Label>
            <Input
              id="max_usage"
              type="number"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
              min={0}
              step={1}
              placeholder="0"
            />
            <p className="text-xs text-neutral-500">0 = tanpa batas.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="starts_at">Mulai Berlaku</Label>
            <Input
              id="starts_at"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expires_at">Kadaluarsa</Label>
            <Input
              id="expires_at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              Aktifkan promo
            </p>
            <p className="text-xs text-neutral-600">
              Promo nonaktif tidak bisa di-redeem oleh pelanggan.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-neutral-300 accent-brand-500"
            />
            <span className="text-sm font-medium">
              {isActive ? "Aktif" : "Nonaktif"}
            </span>
          </label>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {isEdit ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onDelete}
            disabled={deleting || pending}
            className="text-danger hover:bg-danger/10"
          >
            <Trash2 className="size-4" aria-hidden />
            {deleting ? "Menghapus…" : "Hapus"}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending || deleting}>
          <Save className="size-4" aria-hidden />
          {pending ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Buat Promo"}
        </Button>
      </div>
    </form>
  );
}
