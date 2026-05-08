"use client";

import { MessageCircle, Send, Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fillTemplate, waLink } from "@/lib/whatsapp";
import { formatRupiah } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";

type Props = {
  order: OrderDetail;
  storeName: string;
};

const fallbackOrderConfirmation = `Hai {nama_pembeli}! 👋

Pesananmu sudah masuk:

📦 Pesanan: {nomor_pesanan}
{ringkasan_produk}

💰 Total: {total}
🚚 Kurir: {kurir}

Terima kasih sudah pesan di {nama_toko}.`;

const fallbackPaymentLink = `Halo {nama_pembeli}, ini link pembayaran untuk pesanan {nomor_pesanan}:

{link_pembayaran}

Total: {total}`;

const fallbackShippingUpdate = `Halo {nama_pembeli}! Pesananmu {nomor_pesanan} sudah saya kirim. 📦

🚚 Kurir: {kurir}
📋 Nomor Resi: {nomor_resi}

Estimasi sampai 2-4 hari. Makasih! 🙏`;

export function OrderQuickWA({ order, storeName }: Props) {
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

  function open(template: string) {
    const message = fillTemplate(template, baseVars);
    const url = waLink(order.customer_whatsapp, message);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  // Buttons enabled based on order state — only show what makes sense.
  const canConfirm = ["pending", "confirmed", "processing"].includes(order.status);
  const canSendPayment = order.payment_status !== "paid" && order.status !== "cancelled";
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
          onClick={() => open(fallbackOrderConfirmation)}
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
          onClick={() => open(fallbackPaymentLink)}
        >
          <Receipt className="size-4" aria-hidden />
          Kirim Link Pembayaran
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={!canSendShipping}
          onClick={() => open(fallbackShippingUpdate)}
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
    </Card>
  );
}
