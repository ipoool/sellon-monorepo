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

// Hard-coded for MVP — in production this should be a tenant-configured
// support number. Used both as a copy/share helper and the WA deep-link.
const SUPPORT_WA = "6281234567890";

type Props = {
  subscription: Subscription;
};

export function BerlanggananActions({ subscription }: Props) {
  const router = useRouter();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
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

  const totalCents = subscription.pro_price_cents * months;

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
            months,
            notes: `Permintaan upgrade ${months} bulan dari halaman Pengaturan.`,
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
            Pro membuka semua fitur tanpa batasan dan menghapus watermark
            SellOn dari halaman toko publik.
          </p>

          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-brand-700">
                Tier Pro
              </span>
              <span className="font-display text-2xl font-semibold text-neutral-900">
                {formatRupiah(subscription.pro_price_cents)}
                <span className="text-sm font-normal text-neutral-600">
                  /bulan
                </span>
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 text-xs text-neutral-700">
              {[
                "Produk tanpa batas",
                "Otomasi WhatsApp",
                "5 staf admin",
                "Integrasi kurir",
                "Laporan lengkap",
              ].map((b) => (
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
            <ol className="mt-1.5 list-decimal pl-5">
              <li>
                Transfer ke <strong>BCA 1234567890 a/n SellOn</strong> sebesar{" "}
                {formatRupiah(totalCents)}.
              </li>
              <li>
                Kirim bukti transfer ke{" "}
                <a
                  href={`https://wa.me/${SUPPORT_WA}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-success hover:underline"
                >
                  WhatsApp tim SellOn
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
              `Halo SellOn, saya mau upgrade Pro ${months} bulan (${formatRupiah(totalCents)}).`,
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
