"use client";

import { useState } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  CreditCard,
  QrCode,
  MessageCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Bank = {
  bank_name: string;
  holder_name: string;
  account_no: string;
  is_primary: boolean;
  qris_url: string;
};

type Props = {
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  orderNumber: string;
  totalCents: number;
  paymentURL: string;
  bankAccounts: Bank[];
};

export function BuyerPaymentPanel({
  storeSlug,
  storeName,
  storeWhatsApp,
  orderNumber,
  totalCents,
  paymentURL,
  bankAccounts,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  }

  async function markAsPaid() {
    if (
      !confirm(
        "Pastikan kamu sudah transfer/bayar sesuai instruksi. Setelah klik, penjual akan dapat notifikasi untuk verifikasi.",
      )
    )
      return;
    setMarking(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/storefront/${storeSlug}/orders/${orderNumber}/mark-paid`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMarked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setMarking(false);
    }
  }

  // Sort: primary bank/QRIS first
  const sortedBanks = [...bankAccounts].sort((a, b) =>
    a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1,
  );

  const sellerWA = storeWhatsApp
    ? waLink(
        storeWhatsApp,
        `Halo ${storeName}, saya sudah transfer untuk pesanan ${orderNumber}. Total ${formatRupiah(totalCents)}. Terima kasih 🙏`,
      )
    : "";

  return (
    <Card>
      <h2 className="font-semibold text-neutral-900">Pilih Cara Pembayaran</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Total tagihan: <strong>{formatRupiah(totalCents)}</strong>
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {/* Midtrans Snap link */}
        {paymentURL && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
                <CreditCard className="size-5" aria-hidden />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-neutral-900">
                    Bayar Online (QRIS / E-wallet / VA)
                  </p>
                  <Badge variant="brand">Otomatis</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-700">
                  Klik tombol di bawah → bayar di halaman Midtrans → status
                  otomatis ter-update tanpa perlu konfirmasi manual.
                </p>
                <a
                  href={paymentURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex"
                >
                  <Button size="md">
                    Bayar Sekarang
                    <ExternalLink className="size-4" aria-hidden />
                  </Button>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Bank accounts */}
        {sortedBanks
          .filter((b) => b.bank_name && b.account_no)
          .map((b) => (
            <div
              key={b.bank_name + b.account_no}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 font-mono text-xs font-semibold text-neutral-700">
                  {b.bank_name.slice(0, 4).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-neutral-900">{b.bank_name}</p>
                    {b.is_primary && <Badge variant="brand">Utama</Badge>}
                    <span className="ml-auto text-xs text-neutral-500">
                      Transfer Manual
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 font-mono text-sm text-neutral-900">
                      {b.account_no}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copy(b.account_no, b.account_no)}
                    >
                      {copiedKey === b.account_no ? (
                        <Check className="size-4 text-success" aria-hidden />
                      ) : (
                        <Copy className="size-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-600">
                    a.n. <strong>{b.holder_name}</strong>
                  </p>
                </div>
              </div>
            </div>
          ))}

        {/* QRIS images */}
        {sortedBanks
          .filter((b) => b.qris_url)
          .map((b, i) => (
            <div
              key={"qris-" + i}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <QrCode className="size-5" aria-hidden />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900">
                    QRIS Statis{b.bank_name ? ` (${b.bank_name})` : ""}
                  </p>
                  <p className="text-xs text-neutral-600">
                    Scan QR di bawah pakai aplikasi mobile banking, GoPay,
                    OVO, DANA, ShopeePay, dll.
                  </p>
                  <div className="mt-3 inline-block rounded-lg border border-neutral-200 bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.qris_url}
                      alt="QRIS"
                      className="h-48 w-48 object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Confirm-paid button */}
      {(sortedBanks.length > 0 || paymentURL) && (
        <div className="mt-6 border-t border-neutral-200 pt-5">
          {marked ? (
            <div className="flex items-center gap-3 rounded-lg bg-success/10 p-4 text-sm">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              <div>
                <p className="font-medium text-neutral-900">
                  Notifikasi terkirim ke penjual
                </p>
                <p className="text-neutral-600">
                  Penjual akan verifikasi dan kabari kamu via WhatsApp.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-neutral-900">
                Sudah selesai transfer/bayar?
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                Klik tombol di bawah supaya penjual tahu dan mulai verifikasi.
                Untuk transfer manual, kirim juga screenshot bukti via WhatsApp.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="md"
                  onClick={markAsPaid}
                  disabled={marking}
                >
                  <CheckCircle2 className="size-4" aria-hidden />
                  {marking ? "Mengirim…" : "Aku sudah bayar"}
                </Button>
                {sellerWA && (
                  <a href={sellerWA} target="_blank" rel="noopener noreferrer">
                    <Button type="button" size="md" variant="outline">
                      <MessageCircle className="size-4" aria-hidden />
                      Kirim Bukti via WhatsApp
                    </Button>
                  </a>
                )}
              </div>
              {error && (
                <p className="mt-3 text-sm font-medium text-danger">{error}</p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
