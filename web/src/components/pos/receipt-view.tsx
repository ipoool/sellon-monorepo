"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import type { OrderDetail, Store } from "@/lib/types";

type Props = {
  order: OrderDetail;
  store: Store | null;
  cashierName: string;
  autoPrint?: boolean;
  paperWidth?: "58" | "80" | string;
  headerText?: string;
  footerText?: string;
};

function formatDateTime(iso: string) {
  // Explicit Jakarta TZ to keep SSR (UTC) + client output in sync — fixes
  // hydration mismatch errors when server renders different hours than client.
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function ReceiptView({
  order,
  store,
  cashierName,
  autoPrint,
  paperWidth = "58",
  headerText,
  footerText,
}: Props) {
  const widthMm = paperWidth === "80" ? "80mm" : "58mm";
  useEffect(() => {
    if (autoPrint) {
      window.print();
    }
  }, [autoPrint]);

  return (
    <>
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          #receipt {
            width: ${widthMm} !important;
            margin: 0 !important;
            padding: 4mm !important;
            box-shadow: none !important;
            border: none !important;
          }
          @page { size: ${widthMm} auto; margin: 0; }
        }
      `}</style>

      {/* Toolbar (hidden on print) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 shadow-soft">
        <p className="text-sm font-medium text-neutral-700">Pratinjau Struk Thermal {widthMm}</p>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
        >
          <Printer className="size-4" aria-hidden />
          Cetak Struk
        </button>
      </div>

      {/* Receipt */}
      <div
        className="mx-auto my-6 px-2"
        style={{ maxWidth: paperWidth === "80" ? "340px" : "260px" }}
      >
        <div
          id="receipt"
          className="border border-dashed border-neutral-300 bg-white p-3 font-mono text-[11px] leading-tight text-neutral-900"
        >
          {/* Header */}
          <div className="text-center">
            {store?.name && (
              <p className="text-sm font-bold uppercase">{store.name}</p>
            )}
            {store?.tagline && <p className="text-[10px]">{store.tagline}</p>}
            {store?.city && <p className="text-[10px]">{store.city}</p>}
            {store?.whatsapp_number && (
              <p className="text-[10px]">WA: {store.whatsapp_number}</p>
            )}
            {headerText && <p className="text-[10px]">{headerText}</p>}
          </div>

          <Divider />

          {/* Meta */}
          <div className="space-y-0.5">
            <p>No: #{order.order_number}</p>
            <p>Tgl: {formatDateTime(order.created_at ?? new Date().toISOString())}</p>
            <p>Kasir: {cashierName}</p>
          </div>

          <Divider />

          {/* Items */}
          <div className="space-y-1">
            {order.items.map((item) => (
              <div key={item.id}>
                <p>
                  {item.product_name}
                  {item.variant_name ? ` (${item.variant_name})` : ""}
                  {item.serving_type === "takeaway"
                    ? " [Take Away]"
                    : item.serving_type === "dine_in"
                      ? " [Dine In]"
                      : ""}
                </p>
                {item.modifiers?.map((m, i) => (
                  <p key={i} className="pl-2 text-[10px]">
                    + {m.option_name}
                  </p>
                ))}
                <div className="flex justify-between">
                  <span>
                    {item.quantity} × {formatRupiah(item.unit_price_cents)}
                  </span>
                  <span>{formatRupiah(item.subtotal_cents)}</span>
                </div>
              </div>
            ))}
          </div>

          <Divider />

          {/* Totals */}
          <Row label="Subtotal" value={formatRupiah(order.subtotal_cents)} />
          {order.discount_cents > 0 && (
            <Row label="Diskon" value={`-${formatRupiah(order.discount_cents)}`} />
          )}
          {order.shipping_cents > 0 && (
            <Row label="Ongkir" value={formatRupiah(order.shipping_cents)} />
          )}
          <div className="my-1 border-t border-double border-neutral-400" />
          <Row
            label="TOTAL"
            value={formatRupiah(order.total_cents)}
            bold
          />

          <Divider />

          {/* Payment */}
          <Row
            label={paymentLabel(order.payment_method)}
            value={formatRupiah(order.total_cents)}
          />

          <Divider />

          {/* Footer */}
          <div className="mt-2 text-center">
            <p>Terima kasih sudah berbelanja!</p>
            {store?.footer_text && (
              <p className="mt-1 text-[9px] text-neutral-600">{store.footer_text}</p>
            )}
            {footerText && (
              <p className="mt-1 text-[9px] text-neutral-600">{footerText}</p>
            )}
          </div>
        </div>

        <p className="no-print mt-4 text-center text-xs text-neutral-500">
          Format {widthMm} — pastikan printer thermal kamu di-set ke ukuran {widthMm}.
        </p>
      </div>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-dashed border-neutral-400" />;
}

function paymentLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Tunai";
    case "qris":
      return "QRIS";
    case "manual_transfer":
    case "bank_transfer":
      return "Transfer";
    case "midtrans":
      return "Midtrans";
    case "edc_debit":
      return "EDC Debit";
    case "edc_kredit":
      return "EDC Kredit";
    case "pos_split":
      return "Split";
    case "cod":
      return "COD";
    default:
      return method || "-";
  }
}
