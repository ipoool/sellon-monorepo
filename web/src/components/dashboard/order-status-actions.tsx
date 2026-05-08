"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  PackageCheck,
  Truck,
  Award,
  CreditCard,
  Link2,
  Copy,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { OrderDetail } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const couriers = [
  { value: "JNE Reguler", label: "JNE Reguler" },
  { value: "J&T Express", label: "J&T Express" },
  { value: "SiCepat REG", label: "SiCepat REG" },
  { value: "AnterAja", label: "AnterAja" },
  { value: "GoSend", label: "GoSend Same Day" },
  { value: "GrabExpress", label: "GrabExpress" },
];

type Props = {
  order: OrderDetail;
  className?: string;
};

export function OrderStatusActions({ order, className }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showShipForm, setShowShipForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [paymentLink, setPaymentLink] = useState(order.payment_url);
  const [paymentCopied, setPaymentCopied] = useState(false);

  async function call(action: string, body: Record<string, unknown> = {}) {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/orders/${order.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setShowShipForm(false);
      setShowCancelForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses");
    } finally {
      setPending(null);
    }
  }

  const isFinal = order.status === "completed" || order.status === "cancelled";

  async function generatePaymentLink() {
    setPending("payment_link");
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/orders/${order.id}/payment-link`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.payment_url) setPaymentLink(data.payment_url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate link");
    } finally {
      setPending(null);
    }
  }

  async function copyPaymentLink() {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setPaymentCopied(true);
      setTimeout(() => setPaymentCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const canGeneratePaymentLink =
    !isFinal && order.payment_status !== "paid";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {order.status === "pending" && (
          <>
            <Button
              size="sm"
              onClick={() => call("confirm")}
              disabled={!!pending}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {pending === "confirm" ? "Memproses…" : "Konfirmasi Pesanan"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCancelForm((s) => !s)}
              disabled={!!pending}
              className="text-danger hover:bg-danger/10"
            >
              <XCircle className="size-4" aria-hidden />
              Tolak
            </Button>
          </>
        )}

        {order.status === "confirmed" && (
          <Button size="sm" onClick={() => call("process")} disabled={!!pending}>
            <PackageCheck className="size-4" aria-hidden />
            {pending === "process" ? "Memproses…" : "Mulai Proses"}
          </Button>
        )}

        {(order.status === "confirmed" || order.status === "processing") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowShipForm((s) => !s)}
            disabled={!!pending}
          >
            <Truck className="size-4" aria-hidden />
            Kirim & Input Resi
          </Button>
        )}

        {order.status === "shipped" && (
          <Button
            size="sm"
            onClick={() => call("complete")}
            disabled={!!pending}
          >
            <Award className="size-4" aria-hidden />
            {pending === "complete" ? "Memproses…" : "Tandai Selesai"}
          </Button>
        )}

        {order.payment_status !== "paid" && !isFinal && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => call("mark_paid")}
            disabled={!!pending}
          >
            <CreditCard className="size-4" aria-hidden />
            {pending === "mark_paid" ? "Memproses…" : "Tandai Lunas (Manual)"}
          </Button>
        )}

        {!isFinal && order.status !== "pending" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCancelForm((s) => !s)}
            disabled={!!pending}
            className="text-danger hover:bg-danger/10"
          >
            <XCircle className="size-4" aria-hidden />
            Batalkan
          </Button>
        )}
      </div>

      {/* Inline ship form */}
      {showShipForm && (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm font-medium text-neutral-900">
            Input Detail Pengiriman
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void call("ship", {
                courier: String(fd.get("courier") ?? ""),
                courier_service: String(fd.get("courier_service") ?? ""),
                tracking_number: String(fd.get("tracking_number") ?? ""),
              });
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship_courier">Kurir</Label>
              <Select
                id="ship_courier"
                name="courier"
                defaultValue={order.courier || "JNE Reguler"}
              >
                {couriers.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship_service">Layanan (opsional)</Label>
              <Input
                id="ship_service"
                name="courier_service"
                defaultValue={order.courier_service}
                placeholder="REG, YES, dll"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="ship_tracking">No. Resi *</Label>
              <Input
                id="ship_tracking"
                name="tracking_number"
                required
                defaultValue={order.tracking_number}
                placeholder="JNE1234567890"
                className="font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowShipForm(false)}
                disabled={!!pending}
              >
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={!!pending}>
                <Truck className="size-4" aria-hidden />
                {pending === "ship" ? "Memproses…" : "Tandai Dikirim"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Inline cancel form */}
      {showCancelForm && (
        <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
          <p className="text-sm font-medium text-neutral-900">
            Batalkan Pesanan
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void call("cancel", {
                cancellation_reason: String(fd.get("cancellation_reason") ?? ""),
              });
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cancel_reason">Alasan</Label>
              <Select id="cancel_reason" name="cancellation_reason" defaultValue="Stok habis">
                <option value="Stok habis">Stok habis</option>
                <option value="Pembeli tidak respon">Pembeli tidak respon</option>
                <option value="Alamat tidak terjangkau">
                  Alamat tidak terjangkau
                </option>
                <option value="Pembeli minta batal">Pembeli minta batal</option>
                <option value="Lainnya">Lainnya</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowCancelForm(false)}
                disabled={!!pending}
              >
                Tutup
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={!!pending}
              >
                <XCircle className="size-4" aria-hidden />
                {pending === "cancel" ? "Memproses…" : "Konfirmasi Batal"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Payment link generator (Midtrans Snap) */}
      {canGeneratePaymentLink && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              <Link2 className="size-4 text-brand-600" aria-hidden />
              Link Pembayaran (Midtrans Snap)
            </div>
            {!paymentLink && (
              <Button
                size="sm"
                variant="outline"
                onClick={generatePaymentLink}
                disabled={pending === "payment_link"}
              >
                <Link2 className="size-4" aria-hidden />
                {pending === "payment_link"
                  ? "Memproses…"
                  : "Generate Link Pembayaran"}
              </Button>
            )}
          </div>

          {paymentLink ? (
            <div className="mt-3 flex items-stretch gap-2">
              <code className="flex flex-1 items-center overflow-hidden rounded-md border border-neutral-200 bg-white px-3 font-mono text-xs text-neutral-800">
                <span className="truncate">{paymentLink}</span>
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={copyPaymentLink}
                aria-label="Salin link pembayaran"
              >
                {paymentCopied ? (
                  <>
                    <Check className="size-4 text-success" aria-hidden />
                    Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden />
                    Salin
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={generatePaymentLink}
                disabled={pending === "payment_link"}
                title="Re-generate link"
              >
                <Link2 className="size-4" aria-hidden />
                Refresh
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-600">
              Link akan generate dari Midtrans Snap pakai mode aktif
              (sandbox/production) toko-mu. Pembeli klik link → bayar →
              status di sini auto-update via webhook.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
