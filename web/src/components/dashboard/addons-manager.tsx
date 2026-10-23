"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { showError, showSuccess } from "@/lib/toast";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { Addon, GatedFeature } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Seller-facing names. The API speaks in codes; a price card should not. */
const FEATURE_LABELS: Partial<Record<GatedFeature, string>> = {
  pos: "Kasir POS, split payment, tutup shift",
  printer: "Struk printer Bluetooth",
  table_qr: "QR meja, layar dapur, nomor antrian",
  ai_analytics: "Ringkasan penjualan & saran stok AI",
  membership: "Kartu member & tier pelanggan",
  loyalty: "Poin loyalty",
};

/**
 * Pick the packages you actually use.
 *
 * Activating charges nothing today: the package works immediately and
 * joins the next renewal invoice as a whole month. That is the point —
 * nobody is billed for a part-month they cannot check on a calculator.
 */
export function AddonsManager({
  addons,
  plan,
}: {
  addons: Addon[];
  plan: "free" | "pro" | "bisnis";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<Addon | null>(null);

  // Bisnis already contains everything, so there is nothing to sell.
  const bundled = plan === "bisnis";
  const needsPro = plan === "free";

  async function call(code: string, method: "POST" | "DELETE") {
    setBusy(code);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/subscription/addons/${code}`,
        { method, credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || "Gagal memproses");
      }
      showSuccess(
        method === "POST" ? "Paket diaktifkan" : "Paket dinonaktifkan",
      );
      setConfirmOff(null);
      startTransition(() => router.refresh());
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal memproses");
    } finally {
      setBusy(null);
    }
  }

  if (addons.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-neutral-900">
            Paket tambahan
          </h2>
          <p className="mt-0.5 text-sm text-neutral-600">
            {bundled
              ? "Paket Bisnis sudah termasuk semuanya."
              : "Aktifkan yang kamu pakai saja. Tagihannya masuk di perpanjangan berikutnya."}
          </p>
        </div>
        {bundled && <Badge variant="success">Termasuk Bisnis</Badge>}
      </div>

      <ul className="mt-4 grid gap-3 lg:grid-cols-3">
        {addons.map((a) => {
          const on = bundled || a.active;
          const working = busy === a.code;
          return (
            <li
              key={a.code}
              className={
                on
                  ? "rounded-xl border border-brand-300 bg-brand-50/40 p-4"
                  : "rounded-xl border border-neutral-200 bg-white p-4"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-neutral-900">{a.name}</p>
                {on && (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-brand-600"
                    aria-hidden
                  />
                )}
              </div>

              <p className="mt-1">
                <span className="font-display text-xl font-bold text-neutral-900">
                  {formatRupiah(a.monthly_price_cents)}
                </span>
                <span className="text-sm text-neutral-500"> / bulan</span>
              </p>

              <ul className="mt-3 flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
                {a.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-1.5 text-xs text-neutral-600"
                  >
                    <Check
                      className="mt-0.5 size-3 shrink-0 text-brand-500"
                      aria-hidden
                    />
                    <span>{FEATURE_LABELS[f] ?? f}</span>
                  </li>
                ))}
              </ul>

              {/* While a package is in its free tail the seller has it but
                  has not paid for it. Saying so beats letting them discover
                  the charge on the next invoice. */}
              {a.in_free_tail && a.free_until && (
                <p className="mt-3 rounded-md bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">
                  Gratis sampai {formatDateID(a.free_until)}, lalu masuk tagihan
                  perpanjangan.
                </p>
              )}

              {!bundled && (
                <div className="mt-3">
                  {a.active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-danger hover:bg-danger/10"
                      onClick={() => setConfirmOff(a)}
                      disabled={working}
                    >
                      <X className="size-3.5" aria-hidden />
                      Nonaktifkan
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => void call(a.code, "POST")}
                      disabled={working || needsPro}
                      title={
                        needsPro
                          ? "Berlangganan Pro dulu untuk menambahkan paket"
                          : undefined
                      }
                    >
                      {working ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Plus className="size-3.5" aria-hidden />
                      )}
                      Aktifkan
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {needsPro && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
          <Sparkles className="size-3.5 shrink-0 text-brand-500" aria-hidden />
          Paket tambahan bisa diaktifkan setelah kamu berlangganan Pro.
        </p>
      )}

      <ConfirmDialog
        open={confirmOff !== null}
        onClose={() => setConfirmOff(null)}
        title={`Nonaktifkan ${confirmOff?.name ?? ""}?`}
        description={
          `Fiturnya langsung berhenti bisa dipakai. ` +
          `Kalau nanti diaktifkan lagi, masa gratisnya tidak berlaku kedua kali ` +
          `— tagihannya mulai dari perpanjangan berikutnya.`
        }
        confirmLabel="Nonaktifkan"
        kind="danger"
        busy={busy === confirmOff?.code}
        onConfirm={() => {
          if (confirmOff) void call(confirmOff.code, "DELETE");
        }}
      />

      {pending && <p className="mt-2 text-xs text-neutral-400">Menyegarkan…</p>}
    </Card>
  );
}
