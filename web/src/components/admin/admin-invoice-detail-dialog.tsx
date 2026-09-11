"use client";

import { useEffect, useId, useRef } from "react";
import NextImage from "next/image";
import {
  X,
  ExternalLink,
  ImageOff,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import type { AdminSubscriptionInvoice } from "@/lib/types";

type Props = {
  invoice: AdminSubscriptionInvoice | null;
  onClose: () => void;
  // Activation actions, shown only while the invoice is still pending so the
  // admin can verify the receipt and act without closing the dialog first.
  onActivate: (row: AdminSubscriptionInvoice) => void;
  onReject: (row: AdminSubscriptionInvoice) => void;
  busy: boolean;
};

const statusBadge: Record<
  AdminSubscriptionInvoice["status"],
  { variant: "warning" | "success" | "default"; label: string }
> = {
  pending: { variant: "warning", label: "Menunggu Aktivasi" },
  paid: { variant: "success", label: "Aktif" },
  failed: { variant: "default", label: "Ditolak" },
};

const planLabel: Record<string, string> = {
  pro: "Pro",
  bisnis: "Bisnis",
  free: "Gratis",
};

const providerLabel: Record<string, string> = {
  manual_transfer: "Transfer Bank",
  midtrans: "Midtrans",
  admin_grant: "Diberikan Admin",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-neutral-900">
        {children}
      </dd>
    </div>
  );
}

export function AdminInvoiceDetailDialog({
  invoice,
  onClose,
  onActivate,
  onReject,
  busy,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // The table renders one dialog for the whole page, but ids must still be
  // unique against anything else the page mounts.
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (invoice && !d.open) d.showModal();
    if (!invoice && d.open) d.close();
  }, [invoice]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === d) onClose();
    };
    d.addEventListener("click", onBackdrop);
    d.addEventListener("cancel", onClose);
    return () => {
      d.removeEventListener("click", onBackdrop);
      d.removeEventListener("cancel", onClose);
    };
  }, [onClose]);

  const badge = invoice ? statusBadge[invoice.status] : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="fixed left-1/2 top-1/2 m-0 max-h-[90svh] w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      {invoice && (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                src={invoice.owner_picture}
                name={invoice.owner_name || invoice.owner_email}
                size="md"
              />
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="truncate font-display text-base font-semibold text-neutral-900"
                >
                  {invoice.store_name}
                </h2>
                <p className="truncate text-xs text-neutral-500">
                  {invoice.owner_email} · /{invoice.store_slug}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div className="max-h-[calc(90svh-8.5rem)] overflow-y-auto px-5 py-4">
            <dl className="divide-y divide-neutral-100">
              <Row label="Status">
                {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
              </Row>
              <Row label="Paket">
                {planLabel[invoice.plan] ?? invoice.plan} · {invoice.months}{" "}
                bulan
              </Row>
              <Row label="Nominal">
                <span className="font-semibold">
                  {formatRupiah(invoice.amount_cents)}
                </span>
              </Row>
              <Row label="Metode">
                {providerLabel[invoice.provider] ?? invoice.provider ?? "—"}
              </Row>
              <Row label="Diminta">{formatDateTime(invoice.created_at)}</Row>
              <Row label="Diaktifkan">{formatDateTime(invoice.paid_at)}</Row>
              {(invoice.period_start || invoice.period_end) && (
                <Row label="Periode">
                  {formatDateTime(invoice.period_start)} →{" "}
                  {formatDateTime(invoice.period_end)}
                </Row>
              )}
              {invoice.notes && (
                <Row label="Catatan">
                  <span className="text-neutral-600">{invoice.notes}</span>
                </Row>
              )}
              <Row label="No. transaksi">
                <span className="font-mono text-[11px] text-neutral-500">
                  {invoice.id}
                </span>
              </Row>
            </dl>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Bukti transfer
                </h3>
                {invoice.payment_proof_url && (
                  <a
                    href={invoice.payment_proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                  >
                    Buka ukuran penuh
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </div>

              {invoice.payment_proof_url ? (
                <>
                  <a
                    href={invoice.payment_proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
                  >
                    {/* Receipts are phone screenshots of every shape, so the
                        image is contained in a fixed box rather than cropped —
                        a cropped transfer slip can hide the amount. */}
                    <NextImage
                      src={invoice.payment_proof_url}
                      alt={`Bukti transfer ${invoice.store_name}`}
                      width={1000}
                      height={1000}
                      className="mx-auto max-h-[22rem] w-auto object-contain"
                    />
                  </a>
                  <p className="mt-1.5 text-xs text-neutral-500">
                    Dikirim {formatDateTime(invoice.payment_proof_at)}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-sm text-neutral-500">
                  <ImageOff className="size-4 shrink-0" aria-hidden />
                  <span>
                    Seller belum melampirkan bukti transfer. Cek WhatsApp
                    support sebelum mengaktifkan.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            {invoice.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onReject(invoice)}
                  disabled={busy}
                  className="text-danger hover:bg-danger/10"
                >
                  <XCircle className="size-3.5" aria-hidden />
                  Tolak
                </Button>
                <Button
                  size="sm"
                  onClick={() => onActivate(invoice)}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-3.5" aria-hidden />
                  )}
                  Aktifkan
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={onClose}>
                Tutup
              </Button>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
