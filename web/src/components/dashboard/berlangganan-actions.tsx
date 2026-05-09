"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  X,
  Check,
  ShieldOff,
  RotateCcw,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import type { Subscription } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Hard-coded for MVP — in production these should be tenant-configured.
const SUPPORT_WA = "6281291006534"; // 0812 9100 6534
const PAYMENT_BANK = "BCA";
const PAYMENT_ACCOUNT_NO = "2040144776";
const PAYMENT_ACCOUNT_NAME = "Asep Saepulloh";

type Props = {
  subscription: Subscription;
};

export function BerlanggananActions({ subscription }: Props) {
  const router = useRouter();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [tier, setTier] = useState<"pro" | "bisnis">(
    subscription.plan === "bisnis" ? "bisnis" : "pro",
  );
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const upgradeRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLDialogElement>(null);

  // Sync dialog open state. Both dialogs share the same pattern.
  useEffect(() => {
    const d = upgradeRef.current;
    if (!d) return;
    if (showUpgrade && !d.open) d.showModal();
    if (!showUpgrade && d.open) d.close();
  }, [showUpgrade]);
  useEffect(() => {
    const d = cancelRef.current;
    if (!d) return;
    if (showCancel && !d.open) d.showModal();
    if (!showCancel && d.open) d.close();
  }, [showCancel]);

  useEffect(() => {
    const upgrade = upgradeRef.current;
    const cancel = cancelRef.current;
    if (!upgrade || !cancel) return;
    const closeUpgrade = () => setShowUpgrade(false);
    const closeCancel = () => setShowCancel(false);
    const onUpgradeBackdrop = (e: MouseEvent) => {
      if (e.target === upgrade) closeUpgrade();
    };
    const onCancelBackdrop = (e: MouseEvent) => {
      if (e.target === cancel) closeCancel();
    };
    upgrade.addEventListener("click", onUpgradeBackdrop);
    upgrade.addEventListener("cancel", closeUpgrade);
    cancel.addEventListener("click", onCancelBackdrop);
    cancel.addEventListener("cancel", closeCancel);
    return () => {
      upgrade.removeEventListener("click", onUpgradeBackdrop);
      upgrade.removeEventListener("cancel", closeUpgrade);
      cancel.removeEventListener("click", onCancelBackdrop);
      cancel.removeEventListener("cancel", closeCancel);
    };
  }, []);

  const tierPriceCents =
    tier === "bisnis"
      ? subscription.bisnis_price_cents
      : subscription.pro_price_cents;
  const totalCents = tierPriceCents * months;
  const tierLabel = tier === "bisnis" ? "Bisnis" : "Pro";
  const tierFeatures =
    tier === "bisnis"
      ? [
          "Semua fitur Pro",
          "Multi-cabang",
          "Staf tanpa batas",
          "API & webhook",
          "Priority support",
        ]
      : [
          "Produk tanpa batas",
          "Otomasi WhatsApp",
          "5 staf admin",
          "Integrasi kurir",
          "Laporan lengkap",
        ];

  async function requestUpgrade() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/subscription/request-upgrade`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier,
            months,
            notes: `Permintaan upgrade ke ${tierLabel} ${months} bulan dari halaman Pengaturan.`,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSuccess(
        "Permintaan upgrade tercatat. Silakan transfer dan kontak support — tim akan aktifkan dalam 1×24 jam.",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim permintaan");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/subscription/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setShowCancel(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal cancel");
    } finally {
      setBusy(false);
    }
  }

  async function resumeSubscription() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/subscription/resume`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal resume");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {subscription.plan === "free" || subscription.status === "expired" ? (
          <Button onClick={() => setShowUpgrade(true)} size="md">
            <Crown className="size-4" aria-hidden />
            Upgrade ke Pro
          </Button>
        ) : subscription.status === "cancelled" ? (
          <Button onClick={resumeSubscription} disabled={busy} size="md">
            <RotateCcw className="size-4" aria-hidden />
            Aktifkan kembali
          </Button>
        ) : (
          <>
            <Button
              onClick={() => setShowUpgrade(true)}
              variant="outline"
              size="md"
            >
              <Crown className="size-4" aria-hidden />
              Perpanjang
            </Button>
            <Button
              onClick={() => setShowCancel(true)}
              variant="ghost"
              size="md"
              className="text-danger hover:bg-danger/10"
            >
              <ShieldOff className="size-4" aria-hidden />
              Batalkan langganan
            </Button>
          </>
        )}
      </div>

      {error && !showUpgrade && !showCancel && (
        <p className="mt-2 text-sm font-medium text-danger">{error}</p>
      )}

      {/* Upgrade dialog */}
      <dialog
        ref={upgradeRef}
        aria-labelledby="upgrade-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(520px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Crown className="size-5 text-warning" aria-hidden />
            <h2
              id="upgrade-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Upgrade ke Pro
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowUpgrade(false)}
            aria-label="Tutup"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-neutral-700">
            Buka semua fitur tanpa batasan. Pilih tier yang sesuai skala
            tokomu.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTier("pro")}
              className={
                "rounded-lg border-2 p-3 text-left transition-colors " +
                (tier === "pro"
                  ? "border-brand-500 bg-brand-50/50"
                  : "border-neutral-200 bg-white hover:border-neutral-300")
              }
            >
              <p className="text-sm font-semibold text-neutral-900">Pro</p>
              <p className="mt-1 font-display text-base font-semibold text-neutral-900">
                {formatRupiah(subscription.pro_price_cents)}
                <span className="text-xs font-normal text-neutral-600">
                  /bulan
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Untuk toko yang sudah punya pelanggan tetap.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTier("bisnis")}
              className={
                "rounded-lg border-2 p-3 text-left transition-colors " +
                (tier === "bisnis"
                  ? "border-brand-500 bg-brand-50/50"
                  : "border-neutral-200 bg-white hover:border-neutral-300")
              }
            >
              <p className="text-sm font-semibold text-neutral-900">Bisnis</p>
              <p className="mt-1 font-display text-base font-semibold text-neutral-900">
                {formatRupiah(subscription.bisnis_price_cents)}
                <span className="text-xs font-normal text-neutral-600">
                  /bulan
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Multi-cabang, API, priority support.
              </p>
            </button>
          </div>

          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-brand-700">
              Yang termasuk di tier {tierLabel}
            </p>
            <ul className="mt-2 grid gap-1.5 text-xs text-neutral-700 sm:grid-cols-2">
              {tierFeatures.map((b) => (
                <li key={b} className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-brand-600" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="months">Durasi</Label>
            <Select
              id="months"
              value={String(months)}
              onChange={(e) => setMonths(parseInt(e.target.value, 10))}
            >
              <option value="1">1 bulan</option>
              <option value="3">3 bulan</option>
              <option value="6">6 bulan</option>
              <option value="12">12 bulan</option>
            </Select>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              Total: {formatRupiah(totalCents)}
            </p>
          </div>

          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-neutral-800">
            <p className="font-semibold">Cara bayar (manual untuk sekarang):</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>
                Transfer sebesar <strong>{formatRupiah(totalCents)}</strong> ke:
                <div className="mt-1 rounded-md border border-warning/30 bg-white px-2.5 py-2 font-mono text-[11px] leading-snug">
                  {PAYMENT_BANK} <strong>{PAYMENT_ACCOUNT_NO}</strong>
                  <br />
                  a/n {PAYMENT_ACCOUNT_NAME}
                </div>
              </li>
              <li>
                Kirim bukti transfer ke{" "}
                <a
                  href={`https://wa.me/${SUPPORT_WA}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-success hover:underline"
                >
                  WhatsApp 0812-9100-6534
                </a>
                .
              </li>
              <li>
                Klik &ldquo;Saya sudah transfer&rdquo; — tim akan aktifkan
                dalam 1×24 jam.
              </li>
            </ol>
          </div>

          {error && (
            <p className="text-sm font-medium text-danger">{error}</p>
          )}
          {success && (
            <p className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm font-medium text-neutral-800">
              {success}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <a
            href={`https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(
              `Halo SellOn, saya mau upgrade ${tierLabel} ${months} bulan (${formatRupiah(totalCents)}).`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition-colors hover:border-success/40 hover:text-success"
          >
            <MessageCircle className="size-4" aria-hidden />
            Chat support
          </a>
          <Button onClick={requestUpgrade} disabled={busy}>
            <Check className="size-4" aria-hidden />
            {busy ? "Menyimpan…" : "Saya sudah transfer"}
          </Button>
        </div>
      </dialog>

      {/* Cancel dialog */}
      <dialog
        ref={cancelRef}
        aria-labelledby="cancel-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(420px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start gap-3 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="cancel-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Batalkan langganan Pro?
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              Akses Pro tetap aktif sampai{" "}
              {subscription.current_period_end
                ? new Date(
                    subscription.current_period_end,
                  ).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "akhir periode"}
              . Setelah itu akun turun ke tier Gratis. Anda bisa aktifkan
              kembali kapan saja sebelum periode habis.
            </p>
            {error && (
              <p className="mt-2 text-sm font-medium text-danger">{error}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowCancel(false)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={cancelSubscription}
            disabled={busy}
          >
            <ShieldOff className="size-4" aria-hidden />
            {busy ? "Memproses…" : "Ya, batalkan"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
