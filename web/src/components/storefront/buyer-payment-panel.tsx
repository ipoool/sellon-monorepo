"use client";

import { useRef, useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import Image from "next/image";
import {
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  CreditCard,
  QrCode,
  MessageCircle,
  Upload,
  X,
  Loader2,
  ArrowLeft,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  // True kalau bukti sudah pernah di-upload sebelumnya (atau
  // payment_status sudah lewat "unpaid"). Backend juga reject 409 untuk
  // double-defense, tapi FE menyembunyikan tombol agar UX-nya jelas.
  proofAlreadySubmitted?: boolean;
};

export function BuyerPaymentPanel({
  storeSlug,
  storeName,
  storeWhatsApp,
  orderNumber,
  totalCents,
  paymentURL,
  bankAccounts,
  proofAlreadySubmitted = false,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);
  // Tahap konfirmasi: null = belum (tombol "Aku sudah bayar"),
  // "choose" = pilih channel (WA atau sistem), "upload" = form upload.
  type ConfirmStage = null | "choose" | "upload";
  const [stage, setStage] = useState<ConfirmStage>(null);
  // Upload form state.
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string>("");
  const [proofNote, setProofNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  }

  function pickProofFile(f: File | null) {
    if (!f) {
      setProofFile(null);
      setProofPreview("");
      return;
    }
    if (!f.type.startsWith("image/")) {
      showError("File harus berupa gambar (JPG/PNG/WebP).");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      showError("Ukuran maks 10 MB.");
      return;
    }
    setProofFile(f);
    setProofPreview(URL.createObjectURL(f));
  }

  async function submitProof() {
    if (!proofFile) {
      showError("Pilih file bukti dulu.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", proofFile);
      if (proofNote.trim()) fd.append("note", proofNote.trim());
      const res = await fetch(
        `${apiBase}/api/v1/storefront/${storeSlug}/orders/${orderNumber}/payment-proof`,
        { method: "POST", body: fd },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showSuccess("Bukti transfer terkirim. Penjual akan verifikasi.");
      setMarked(true);
      setStage(null);
    } catch (err) {
      showError(err);
    } finally {
      setUploading(false);
    }
  }

  async function sendViaWA() {
    if (!sellerWA) return;
    // Tetap kirim sinyal mark-paid ke backend supaya seller dapat
    // trigger verifikasi di dashboard (status: pending). User akan
    // attach screenshot sendiri di WhatsApp.
    try {
      await fetch(
        `${apiBase}/api/v1/storefront/${storeSlug}/orders/${orderNumber}/mark-paid`,
        { method: "POST" },
      );
    } catch {
      // best-effort — open WA tetap lanjut
    }
    window.open(sellerWA, "_blank", "noopener,noreferrer");
    setMarked(true);
    setStage(null);
  }

  // Sort: primary bank/QRIS first, then split into transfer + QRIS lists in
  // a single pass so the JSX doesn't iterate twice.
  const sortedBanks = bankAccounts.toSorted((a, b) =>
    a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1,
  );
  const transferBanks = [];
  const qrisBanks = [];
  for (const b of sortedBanks) {
    if (b.bank_name && b.account_no) transferBanks.push(b);
    if (b.qris_url) qrisBanks.push(b);
  }

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
        {transferBanks.map((b) => (
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
        {qrisBanks.map((b) => (
            <div
              key={`qris-${b.qris_url}`}
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
                    <Image
                      src={b.qris_url}
                      alt="QRIS"
                      width={192}
                      height={192}
                      className="size-48 object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Confirm-paid button + 2-channel options */}
      {(sortedBanks.length > 0 || paymentURL) && (
        <div className="mt-6 border-t border-neutral-200 pt-5">
          {marked || proofAlreadySubmitted ? (
            <div className="flex items-center gap-3 rounded-lg bg-success/10 p-4 text-sm">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              <div>
                <p className="font-medium text-neutral-900">
                  {proofAlreadySubmitted && !marked
                    ? "Bukti sudah pernah dikirim"
                    : "Notifikasi terkirim ke penjual"}
                </p>
                <p className="text-neutral-600">
                  Penjual akan verifikasi dan kabari kamu lewat WhatsApp.
                  Kalau ada masalah dengan bukti, hubungi penjual langsung.
                </p>
              </div>
            </div>
          ) : stage === null ? (
            <>
              <p className="text-sm font-medium text-neutral-900">
                Sudah selesai transfer/bayar?
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                Klik tombol di bawah lalu pilih cara kirim bukti — lewat
                sistem (otomatis tersimpan di pesanan) atau lewat WhatsApp.
              </p>
              <div className="mt-3">
                <Button
                  type="button"
                  size="md"
                  onClick={() => setStage("choose")}
                >
                  <CheckCircle2 className="size-4" aria-hidden />
                  Aku sudah bayar
                </Button>
              </div>
            </>
          ) : stage === "choose" ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-neutral-900">
                  Pilih cara kirim bukti
                </p>
                <button
                  type="button"
                  onClick={() => setStage(null)}
                  className="inline-flex items-center gap-1 rounded-md p-1 text-xs text-neutral-500 hover:text-neutral-900"
                >
                  <ArrowLeft className="size-3.5" aria-hidden /> Kembali
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setStage("upload")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Upload className="size-5" aria-hidden />
                  </span>
                  <span className="font-semibold text-neutral-900">
                    Upload di sini
                  </span>
                  <span className="text-xs text-neutral-600">
                    Pilih file screenshot. Otomatis tersimpan di pesananmu —
                    penjual lihat langsung di dashboard.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={sendViaWA}
                  disabled={!sellerWA}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-xl border bg-white p-4 text-left transition-colors",
                    sellerWA
                      ? "border-neutral-200 hover:border-success/40 hover:bg-success/5"
                      : "cursor-not-allowed border-neutral-200 opacity-50",
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-success/15 text-success">
                    <MessageCircle className="size-5" aria-hidden />
                  </span>
                  <span className="font-semibold text-neutral-900">
                    Kirim via WhatsApp
                  </span>
                  <span className="text-xs text-neutral-600">
                    Buka chat dengan penjual — attach screenshot manual di
                    sana. Cocok kalau kamu mau tanya juga.
                  </span>
                </button>
              </div>
            </>
          ) : (
            // stage === "upload"
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-neutral-900">
                  Upload bukti transfer
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStage("choose");
                    setProofFile(null);
                    setProofPreview("");
                    setProofNote("");
                  }}
                  className="inline-flex items-center gap-1 rounded-md p-1 text-xs text-neutral-500 hover:text-neutral-900"
                >
                  <ArrowLeft className="size-3.5" aria-hidden /> Kembali
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3">
                {proofFile ? (
                  <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    {proofPreview && (
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-white">
                        <Image
                          src={proofPreview}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {proofFile.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {(proofFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProofFile(null);
                        setProofPreview("");
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="rounded-md p-1 text-neutral-500 hover:bg-neutral-200"
                      aria-label="Hapus file"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-600 hover:border-brand-400 hover:bg-brand-50/30"
                  >
                    <Upload className="size-5 text-neutral-500" aria-hidden />
                    <span className="font-medium">Pilih screenshot bukti</span>
                    <span className="text-xs text-neutral-500">
                      JPG/PNG/WebP — maks 10 MB
                    </span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => pickProofFile(e.target.files?.[0] ?? null)}
                />

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="proof-note" className="text-xs">
                    Catatan untuk penjual (opsional)
                  </Label>
                  <textarea
                    id="proof-note"
                    value={proofNote}
                    onChange={(e) => setProofNote(e.target.value)}
                    placeholder="Mis. transfer dari rekening atas nama …"
                    rows={2}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="md"
                    onClick={submitProof}
                    disabled={!proofFile || uploading}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="size-4" aria-hidden />
                    )}
                    {uploading ? "Mengirim…" : "Kirim Bukti"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
