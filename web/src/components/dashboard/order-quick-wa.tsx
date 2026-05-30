"use client";

import { useState } from "react";
import { MessageCircle, Send, Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fillTemplate, waLink } from "@/lib/whatsapp";
import { formatRupiah } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type TemplateKey = "order_confirmation" | "payment_link" | "shipping_update";

const templateLabels: Record<TemplateKey, string> = {
  order_confirmation: "Konfirmasi Pesanan",
  payment_link: "Link Pembayaran",
  shipping_update: "Update Resi",
};

type PendingSend = {
  key: TemplateKey;
  message: string;
  url: string;
};

type Props = {
  order: OrderDetail;
  storeName: string;
  // Seller's custom WA templates from the whatsapp_templates table.
  // Per-key: empty / missing → we use the hardcoded fallback below.
  // Edited via Pengaturan → WhatsApp.
  templates: Record<string, string>;
};

const fallbackOrderConfirmation = `Hai {{nama_pembeli}}! 👋

Pesananmu sudah masuk:

📦 Pesanan: {{nomor_pesanan}}
{{ringkasan_produk}}

💰 Total: {{total}}
🚚 Kurir: {{kurir}}

Terima kasih sudah pesan di {{nama_toko}}.`;

const fallbackPaymentLink = `Halo {{nama_pembeli}}, ini link pembayaran untuk pesanan {{nomor_pesanan}}:

{{link_pembayaran}}

Total: {{total}}`;

const fallbackShippingUpdate = `Halo {{nama_pembeli}}! Pesananmu {{nomor_pesanan}} sudah saya kirim. 📦

🚚 Kurir: {{kurir}}
📋 Nomor Resi: {{nomor_resi}}

Estimasi sampai 2-4 hari. Makasih! 🙏`;

export function OrderQuickWA({ order, storeName, templates }: Props) {
  const [pending, setPending] = useState<PendingSend | null>(null);

  // Pick the seller's customized body if they set one, else fallback.
  // Trim guards against the seller saving an empty string to "reset".
  function bodyFor(key: string, fallback: string): string {
    const custom = (templates[key] ?? "").trim();
    return custom || fallback;
  }

  const ringkasan = order.items
    .map(
      (it) =>
        `${it.quantity}× ${it.product_name} @ ${formatRupiah(it.unit_price_cents)} = ${formatRupiah(it.subtotal_cents)}`,
    )
    .join("\n");

  const baseVars = {
    nama_pembeli: order.customer_name,
    nama_toko: storeName,
    nomor_pesanan: order.order_number,
    ringkasan_produk: ringkasan,
    total: formatRupiah(order.total_cents),
    kurir: order.courier || "—",
    nomor_resi: order.tracking_number || "—",
    link_pembayaran: order.payment_url || "(belum tersedia)",
    batas_waktu: "24 jam",
    link_tracking: order.tracking_number
      ? `https://cekresi.com/?noresi=${order.tracking_number}`
      : "",
    estimasi_sampai: "2-4 hari kerja",
  };

  // Build the filled message + WA link and stage it for the confirm
  // dialog. Actual send (window.open + audit log) happens on confirm.
  function stage(templateKey: TemplateKey, templateBody: string) {
    const message = fillTemplate(templateBody, baseVars);
    const url = waLink(order.customer_whatsapp, message);
    if (!url) return;
    setPending({ key: templateKey, message, url });
  }

  function confirmSend() {
    if (!pending) return;
    // Record audit entry first (fire-and-forget — UX shouldn't wait for
    // the log to land). The click on "Lanjutkan" inside the dialog is
    // still a user gesture, so window.open won't be popup-blocked.
    void fetch(`${apiBase}/api/v1/orders/${order.id}/wa-log`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: pending.key,
        message: pending.message,
        recipient: order.customer_whatsapp,
      }),
    }).catch(() => {
      // Audit log failure shouldn't block the seller from sending — they
      // can always re-trigger if they need the log entry.
    });
    window.open(pending.url, "_blank", "noopener,noreferrer");
    setPending(null);
  }

  // Buttons enabled based on order state — only show what makes sense.
  const canConfirm = ["pending", "confirmed", "processing"].includes(order.status);
  const hasPaymentUrl = !!order.payment_url;
  const canSendPayment = hasPaymentUrl && order.payment_status !== "paid" && order.status !== "cancelled";
  const showPaymentHint = !hasPaymentUrl && order.payment_status !== "paid" && order.status !== "cancelled";
  const canSendShipping = order.status === "shipped" && !!order.tracking_number;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="size-4 text-success" aria-hidden />
        <h2 className="font-semibold text-neutral-900">Kirim WhatsApp</h2>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Template otomatis ter-fill dengan data pesanan ini. Edit template default
        di Pengaturan → WhatsApp.
      </p>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={!canConfirm}
          onClick={() =>
            stage(
              "order_confirmation",
              bodyFor("order_confirmation", fallbackOrderConfirmation),
            )
          }
        >
          <Send className="size-4" aria-hidden />
          Konfirmasi Pesanan
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={!canSendPayment}
          onClick={() =>
            stage("payment_link", bodyFor("payment_link", fallbackPaymentLink))
          }
        >
          <Receipt className="size-4" aria-hidden />
          Kirim Link Pembayaran
        </Button>
        {showPaymentHint && (
          <p className="text-xs text-neutral-500">
            Generate payment link dulu via tombol &ldquo;Buat Link Pembayaran&rdquo; di halaman pesanan.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={!canSendShipping}
          onClick={() =>
            stage(
              "shipping_update",
              bodyFor("shipping_update", fallbackShippingUpdate),
            )
          }
        >
          <Send className="size-4" aria-hidden />
          Kirim Update Resi
        </Button>
      </div>

      {order.customer_whatsapp ? (
        <p className="mt-3 break-all text-xs text-neutral-500">
          ke: <span className="font-mono">{order.customer_whatsapp}</span>
        </p>
      ) : (
        <p className="mt-3 text-xs text-danger">Pembeli belum punya nomor WhatsApp.</p>
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmSend}
        title={
          pending
            ? `Kirim ${templateLabels[pending.key]} via WhatsApp?`
            : "Kirim via WhatsApp?"
        }
        kind="default"
        confirmLabel="Buka WhatsApp"
        cancelLabel="Batal"
        confirmIcon={<MessageCircle className="size-4" aria-hidden />}
        description={
          pending && (
            <div className="flex flex-col gap-2.5">
              <p>
                Pesan akan dikirim ke{" "}
                <span className="font-mono text-neutral-800">
                  {order.customer_whatsapp || "—"}
                </span>
                . Tab WhatsApp Web/aplikasi akan terbuka dengan pesan sudah
                ter-isi — tekan kirim di sana untuk mengirim.
              </p>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50">
                <p className="border-b border-neutral-200 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Preview pesan
                </p>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 font-sans text-xs text-neutral-800">
                  {pending.message}
                </pre>
              </div>
            </div>
          )
        }
      />
    </Card>
  );
}
