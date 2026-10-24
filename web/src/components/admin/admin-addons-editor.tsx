"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import type { AdminAddon, GatedFeature } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const FEATURE_LABELS: Partial<Record<GatedFeature, string>> = {
  pos: "Kasir POS",
  printer: "Struk printer",
  table_qr: "QR meja & dapur",
  ai_analytics: "Analisa AI",
  membership: "Membership",
  loyalty: "Loyalty",
};

/**
 * Price the add-on packages without a deploy, the same contract the plans
 * editor has.
 *
 * What a package CONTAINS is not editable here. That lives in
 * domain/feature in the API, because a feature list edited beside a price
 * is one that drifts from the map which actually enforces it — the
 * contents are shown read-only so you can see what you are pricing.
 */
export function AdminAddonsEditor({ initial }: { initial: AdminAddon[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (initial.length === 0) return null;

  return (
    <Card className="mt-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-neutral-900">
          Paket tambahan
        </h2>
        <span className="text-xs text-neutral-500">
          Dijual di atas Pro · sudah termasuk di Bisnis
        </span>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Harga berlaku untuk tagihan berikutnya. Pelanggan yang sedang dalam
        periode berjalan tidak terpengaruh — harganya dikunci saat invoice
        dibuat.
      </p>

      <ul className="flex flex-col gap-3">
        {initial.map((a) => (
          <AddonRow
            key={a.code}
            addon={a}
            onSaved={() => startTransition(() => router.refresh())}
          />
        ))}
      </ul>

      {pending && <p className="mt-3 text-xs text-neutral-400">Menyegarkan…</p>}
    </Card>
  );
}

function AddonRow({
  addon,
  onSaved,
}: {
  addon: AdminAddon;
  onSaved: () => void;
}) {
  const [name, setName] = useState(addon.name);
  const [description, setDescription] = useState(addon.description);
  // Edited in rupiah, stored in cents. Sellers and operators think in
  // rupiah; only the database thinks in cents.
  const [monthly, setMonthly] = useState(String(addon.monthly_price_cents / 100));
  const [yearly, setYearly] = useState(String(addon.yearly_price_cents / 100));
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);

  const dirty =
    name !== addon.name ||
    description !== addon.description ||
    Number(monthly) * 100 !== addon.monthly_price_cents ||
    Number(yearly) * 100 !== addon.yearly_price_cents;

  async function save(nextActive = addon.is_active) {
    const m = Number(monthly);
    const y = Number(yearly);
    if (!Number.isFinite(m) || !Number.isFinite(y) || m < 0 || y < 0) {
      showError("Harga harus angka dan tidak boleh negatif");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/addons/${addon.code}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          monthly_price_cents: Math.round(m * 100),
          yearly_price_cents: Math.round(y * 100),
          is_active: nextActive,
          sort_order: addon.sort_order,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Gagal menyimpan");
      showSuccess(`${name} disimpan`);
      setConfirmRetire(false);
      onSaved();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
              {addon.code}
            </span>
            {!addon.is_active && <Badge variant="default">Tidak dijual</Badge>}
            {addon.active_stores > 0 && (
              <span className="text-xs text-neutral-500">
                {addon.active_stores} toko aktif
              </span>
            )}
          </div>
          {/* Read-only contents: you are pricing these, not choosing them. */}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {addon.features.map((f) => (
              <li
                key={f}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
              >
                <Lock className="size-2.5 text-neutral-400" aria-hidden />
                {FEATURE_LABELS[f] ?? f}
              </li>
            ))}
          </ul>
        </div>
        <p className="shrink-0 font-display text-lg font-bold text-neutral-900">
          {formatRupiah(addon.monthly_price_cents)}
          <span className="text-xs font-normal text-neutral-500"> / bulan</span>
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${addon.code}-name`}>Nama</Label>
          <Input
            id={`${addon.code}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={`${addon.code}-desc`}>Deskripsi</Label>
          <Input
            id={`${addon.code}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={`${addon.code}-monthly`}>Harga bulanan (Rp)</Label>
          <Input
            id={`${addon.code}-monthly`}
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            inputMode="numeric"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={`${addon.code}-yearly`}>
            Harga tahunan (Rp / bulan)
          </Label>
          <Input
            id={`${addon.code}-yearly`}
            value={yearly}
            onChange={(e) => setYearly(e.target.value)}
            inputMode="numeric"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Figur per bulan saat bayar 12 bulan sekaligus.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          Simpan
        </Button>
        {addon.is_active ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:bg-danger/10"
            onClick={() => setConfirmRetire(true)}
            disabled={busy}
          >
            Berhenti jual
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void save(true)}
            disabled={busy}
          >
            Jual lagi
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRetire}
        onClose={() => setConfirmRetire(false)}
        title={`Berhenti menjual ${addon.name}?`}
        description={
          addon.active_stores > 0
            ? `${addon.active_stores} toko sedang memakainya. Mereka TETAP bisa ` +
              `pakai dan tetap ditagih seperti biasa — yang berhenti cuma ` +
              `penjualan ke toko baru.`
            : `Paket ini hilang dari halaman berlangganan. Tidak ada toko yang ` +
              `terpengaruh karena belum ada yang memakainya.`
        }
        confirmLabel="Berhenti jual"
        kind="danger"
        busy={busy}
        onConfirm={() => void save(false)}
      />
    </li>
  );
}
