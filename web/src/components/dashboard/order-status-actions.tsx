"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { showError, showSuccess } from "@/lib/toast";
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
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import type { OrderDetail, PaymentGatewayStatus } from "@/lib/types";

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
  paymentGateway: PaymentGatewayStatus;
  className?: string;
};

// What confirm dialog is currently being shown. We thread this through
// a single state so two buttons can't both have confirm dialogs open
// simultaneously, and so each dialog can carry the args it needs to
// run when confirmed (e.g. ship form has tracking + courier).
type ConfirmState =
  | { kind: "confirm" }
  | { kind: "process" }
  | { kind: "complete" }
  | { kind: "mark_paid" }
  | { kind: "ship"; courier: string; courier_service: string; tracking_number: string }
  | { kind: "cancel"; cancellation_reason: string }
  | { kind: "refund"; refund_amount_cents: number; refund_reason: string }
  | { kind: "payment_link" }
  | { kind: "payment_link_blocked" }
  | { kind: "payment_link_sandbox" }
  | null;

const refundReasons = [
  "Pembeli batal pesan",
  "Stok habis / kehabisan barang",
  "Produk rusak / cacat",
  "Pengiriman bermasalah",
  "Salah kirim",
  "Permintaan pembeli",
  "Lainnya",
];

// Mirrors api/internal/payments.IsMidtransPaymentMethod — keep in sync.
const MIDTRANS_METHODS = new Set([
  "credit_card",
  "card",
  "bank_transfer",
  "va",
  "echannel",
  "bca_va",
  "bni_va",
  "bri_va",
  "permata_va",
  "cimb_va",
  "gopay",
  "shopeepay",
  "qris",
]);

function isMidtransMethod(method: string): boolean {
  return MIDTRANS_METHODS.has(method);
}

export function OrderStatusActions({ order, paymentGateway, className }: Props) {
  const { push, refresh } = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  // Inline forms are mutually exclusive — opening one auto-closes the others
  // so the action panel never has two competing forms onscreen at once.
  type OpenForm = "ship" | "cancel" | "refund" | null;
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [paymentLink, setPaymentLink] = useState(() => order.payment_url);
  const [paymentCopied, setPaymentCopied] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  async function call(action: string, body: Record<string, unknown> = {}) {
    setPending(action);
    try {
      const res = await fetch(`${apiBase}/api/v1/orders/${order.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setOpenForm(null);
      setConfirm(null);
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(null);
    }
  }

  const isFinal = order.status === "completed" || order.status === "cancelled";

  async function generatePaymentLink() {
    setPending("payment_link");
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
      setConfirm(null);
      refresh();
    } catch (err) {
      showError(err);
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

  // Preflight check: payment-link button has 3 outcomes —
  //   1. Midtrans not configured (no server keys) → blocked dialog.
  //   2. Configured but active env is sandbox → warning dialog.
  //   3. Configured + production → straight to confirm.
  // The active env's server key must exist; otherwise the API would 400
  // with "Server Key untuk mode aktif belum diisi".
  function startPaymentLinkFlow() {
    const activeKeyMissing = paymentGateway.is_sandbox
      ? !paymentGateway.has_sandbox_server_key
      : !paymentGateway.has_prod_server_key;
    if (!paymentGateway.is_configured || activeKeyMissing) {
      setConfirm({ kind: "payment_link_blocked" });
      return;
    }
    if (paymentGateway.is_sandbox) {
      setConfirm({ kind: "payment_link_sandbox" });
      return;
    }
    setConfirm({ kind: "payment_link" });
  }

  // Dispatcher: every dialog confirm routes here so the JSX below
  // doesn't need bespoke onConfirm handlers per action kind.
  async function runConfirmed() {
    if (!confirm) return;
    switch (confirm.kind) {
      case "confirm":
        await call("confirm");
        break;
      case "process":
        await call("process");
        break;
      case "complete":
        await call("complete");
        break;
      case "mark_paid":
        await call("mark_paid");
        break;
      case "ship":
        await call("ship", {
          courier: confirm.courier,
          courier_service: confirm.courier_service,
          tracking_number: confirm.tracking_number,
        });
        break;
      case "cancel":
        await call("cancel", { cancellation_reason: confirm.cancellation_reason });
        break;
      case "refund":
        await call("refund", {
          refund_amount_cents: confirm.refund_amount_cents,
          refund_reason: confirm.refund_reason,
        });
        break;
      case "payment_link":
        await generatePaymentLink();
        break;
      case "payment_link_sandbox":
        await generatePaymentLink();
        break;
      case "payment_link_blocked":
        setConfirm(null);
        push("/settings/payment");
        break;
    }
  }

  const canGeneratePaymentLink =
    !isFinal && order.payment_status !== "paid";

  // Per-kind metadata for the dialog. Centralized so the JSX stays clean.
  function dialogConfig(c: ConfirmState): {
    title: string;
    description: ReactNode;
    confirmLabel: string;
    kind?: "default" | "warning" | "danger";
  } | null {
    if (!c) return null;
    switch (c.kind) {
      case "confirm":
        return {
          title: `Konfirmasi pesanan #${order.order_number}?`,
          description:
            "Pesanan akan masuk ke status 'dikonfirmasi' dan kamu siap untuk mulai memproses.",
          confirmLabel: "Ya, konfirmasi",
        };
      case "process":
        return {
          title: `Mulai proses pesanan #${order.order_number}?`,
          description:
            "Status berubah jadi 'sedang diproses'. Pelanggan akan tahu pesanannya sedang disiapkan.",
          confirmLabel: "Ya, mulai proses",
        };
      case "complete":
        return {
          title: `Tandai pesanan #${order.order_number} selesai?`,
          description:
            "Pesanan masuk status 'selesai'. Pastikan paket sudah benar-benar diterima pelanggan.",
          confirmLabel: "Ya, selesai",
        };
      case "mark_paid":
        return {
          title: `Konfirmasi pembayaran #${order.order_number}?`,
          description: (
            <>
              Status pembayaran akan diubah ke <strong>lunas</strong>{" "}
              manual.
              <br />
              <span className="mt-2 block">
                <strong>Pakai opsi ini cuma kalau:</strong> kamu sudah lihat
                uangnya masuk di mutasi rekening / e-wallet sendiri. Salah
                konfirmasi = produk dikirim padahal belum dibayar.
              </span>
            </>
          ),
          confirmLabel: "Ya, sudah saya cek",
          kind: "warning",
        };
      case "ship":
        return {
          title: `Tandai pesanan #${order.order_number} dikirim?`,
          description: (
            <>
              Pengiriman: <strong>{c.courier}</strong>
              {c.courier_service ? ` (${c.courier_service})` : ""} · Resi:{" "}
              <code className="font-mono text-xs">{c.tracking_number}</code>.
              <br />
              Status berubah ke 'dikirim' dan tidak bisa di-undo dari sini.
            </>
          ),
          confirmLabel: "Ya, kirim",
        };
      case "cancel":
        return {
          title: `Batalkan pesanan #${order.order_number}?`,
          description: (
            <>
              Alasan: <strong>{c.cancellation_reason}</strong>.
              <br />
              Stok produk akan dikembalikan otomatis. Pesanan yang sudah
              dibatalkan tidak bisa dipulihkan.
              {order.payment_status === "paid" && (
                <span className="mt-2 block text-xs text-neutral-700">
                  <strong>Catatan:</strong> pesanan ini sudah dibayar. Jangan
                  lupa kirim balik uangnya ke pembeli, lalu pakai{" "}
                  <strong>Refund Pesanan</strong> untuk mencatatnya.
                </span>
              )}
            </>
          ),
          confirmLabel: "Ya, batalkan",
          kind: "danger",
        };
      case "payment_link":
        return {
          title: "Generate link pembayaran Midtrans?",
          description:
            "Link Snap baru dibuat & dikirim ke pembeli. Kalau sebelumnya sudah ada link, akan diganti dengan yang baru.",
          confirmLabel: "Ya, buat link",
        };
      case "payment_link_blocked":
        return {
          title: "Midtrans belum aktif",
          description: (
            <>
              {!paymentGateway.is_configured ? (
                <>
                  Toko-mu belum mengisi konfigurasi Midtrans, jadi link
                  pembayaran tidak bisa dibuat.
                </>
              ) : (
                <>
                  Mode aktif ({paymentGateway.is_sandbox ? "Sandbox" : "Production"}){" "}
                  belum punya Server Key. Lengkapi dulu di Pengaturan -
                  Pembayaran.
                </>
              )}
              <br />
              <span className="mt-2 block text-xs text-neutral-600">
                Sambil menunggu setup, kamu masih bisa pakai{" "}
                <strong>Konfirmasi Pembayaran Manual</strong> kalau pembeli
                transfer langsung ke rekening kamu.
              </span>
            </>
          ),
          confirmLabel: "Buka Pengaturan Pembayaran",
          kind: "warning",
        };
      case "payment_link_sandbox":
        return {
          title: "Midtrans masih dalam mode Sandbox",
          description: (
            <>
              Mode aktif toko-mu masih <strong>Sandbox (testing)</strong> -
              link yang dibuat hanya untuk uji coba dan{" "}
              <strong>tidak akan minta uang sungguhan</strong> dari pembeli.
              <br />
              <span className="mt-2 block text-xs text-neutral-600">
                Untuk pembayaran asli, ganti ke mode Production di Pengaturan -
                Pembayaran setelah Server Key Production aktif.
              </span>
            </>
          ),
          confirmLabel: "Lanjut, ini cuma test",
          kind: "warning",
        };
      case "refund": {
        const viaMidtrans = isMidtransMethod(order.payment_method);
        return {
          title: `Refund pesanan #${order.order_number}?`,
          description: (
            <>
              Refund <strong>{formatRupiah(c.refund_amount_cents)}</strong> -
              alasan: <strong>{c.refund_reason}</strong>.
              <br />
              {viaMidtrans ? (
                <span className="mt-2 block">
                  <strong>Refund otomatis lewat Midtrans.</strong> SellOn akan
                  panggil API refund Midtrans pakai Server Key toko-mu.
                  Kalau Midtrans tolak (mis. metode tidak support direct
                  refund), kamu akan dapat error dan harus refund manual.
                </span>
              ) : (
                <span className="mt-2 block">
                  <strong>Penting:</strong> pembayaran ini bukan via
                  Midtrans. Pengembalian uang harus kamu lakukan sendiri
                  (transfer manual ke rekening pembeli). Tombol ini hanya
                  mencatat refund di sistem.
                </span>
              )}
              {order.status !== "cancelled" && (
                <span className="mt-2 block text-xs text-neutral-600">
                  Pesanan akan ditandai dibatalkan dan stok produk
                  dikembalikan otomatis.
                </span>
              )}
            </>
          ),
          confirmLabel: viaMidtrans
            ? "Ya, proses refund Midtrans"
            : "Ya, catat refund",
          kind: "danger",
        };
      }
    }
  }

  const cfg = dialogConfig(confirm);

  // Per-status hint shown above the button bar so the seller doesn't have to
  // guess which button is the "right next step". Only set for non-final
  // states — the banner is hidden for completed/cancelled orders.
  const nextStepHint: { title: string; body: string } | null = (() => {
    if (isFinal) return null;
    switch (order.status) {
      case "pending":
        return {
          title: "Pesanan baru masuk",
          body: "Cek detail produk & alamat pembeli. Kalau OK, klik Konfirmasi Pesanan. Kalau ada masalah, batalkan dengan alasan.",
        };
      case "confirmed":
        return {
          title: "Siap diproses",
          body:
            order.payment_status === "paid"
              ? "Pembayaran lunas. Klik Mulai Proses lalu siapkan paket."
              : "Pembeli belum bayar. Tunggu pembayaran masuk atau kirim link Midtrans di bawah.",
        };
      case "processing":
        return {
          title: "Sedang disiapkan",
          body: "Kalau paket sudah siap dikirim, klik Kirim & Input Resi.",
        };
      case "shipped":
        return {
          title: "Pesanan dalam pengiriman",
          body: "Tandai Selesai setelah pembeli konfirmasi terima paket.",
        };
      default:
        return null;
    }
  })();

  const shipFormRef = useRef<HTMLDivElement>(null);

  // Scroll the ship form into view and focus its first input when it opens.
  // Without this the form renders below the button bar and is easy to miss,
  // especially on shorter viewports or when the order detail page is long.
  useEffect(() => {
    if (openForm === "ship" && shipFormRef.current) {
      shipFormRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      shipFormRef.current.querySelector<HTMLSelectElement>("select")?.focus();
    }
  }, [openForm]);

  // Toggle helper: opening one form auto-closes the others, and clicking
  // the same button again closes the form.
  function toggleForm(name: NonNullable<OpenForm>) {
    setOpenForm((cur) => (cur === name ? null : name));
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {nextStepHint && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2.5">
          <p className="text-sm font-semibold text-neutral-900">
            Langkah selanjutnya: {nextStepHint.title}
          </p>
          <p className="mt-0.5 text-xs text-neutral-700">{nextStepHint.body}</p>
        </div>
      )}

      {/* Primary fulfillment flow — exactly one main CTA per status, plus
          the inline-form trigger when the next step needs extra input. */}
      <div className="flex flex-wrap items-center gap-2">
        {order.status === "pending" && (
          <Button
            size="md"
            onClick={() => setConfirm({ kind: "confirm" })}
            disabled={!!pending}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            Konfirmasi Pesanan
          </Button>
        )}

        {order.status === "confirmed" && (
          <Button
            size="md"
            onClick={() => setConfirm({ kind: "process" })}
            disabled={!!pending}
          >
            <PackageCheck className="size-4" aria-hidden />
            Mulai Proses
          </Button>
        )}

        {(order.status === "confirmed" || order.status === "processing") && (
          <Button
            size="md"
            variant={order.status === "processing" ? "default" : "outline"}
            onClick={() => toggleForm("ship")}
            disabled={!!pending}
            aria-pressed={openForm === "ship"}
          >
            <Truck className="size-4" aria-hidden />
            Kirim & Input Resi
          </Button>
        )}

        {order.status === "shipped" && (
          <Button
            size="md"
            onClick={() => setConfirm({ kind: "complete" })}
            disabled={!!pending}
          >
            <Award className="size-4" aria-hidden />
            Tandai Selesai
          </Button>
        )}
      </div>

      {/* Payment group — heading + helper makes it clear these are
          payment-side actions, not fulfillment. Visible whenever the seller
          can still mark-paid or trigger a refund. */}
      {(() => {
        const canMarkPaid = order.payment_status !== "paid" && !isFinal;
        const canRefund =
          order.payment_status === "paid" && order.refunded_at == null;
        if (!canMarkPaid && !canRefund) return null;
        return (
          <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Pembayaran
            </p>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
              {canMarkPaid && (
                <div className="flex flex-col">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirm({ kind: "mark_paid" })}
                    disabled={!!pending}
                  >
                    <CreditCard className="size-4" aria-hidden />
                    Konfirmasi Pembayaran Manual
                  </Button>
                  <p className="mt-1 max-w-[18rem] text-xs text-neutral-500">
                    Pakai kalau kamu sudah cek mutasi rekening / e-wallet sendiri.
                  </p>
                </div>
              )}

              {canRefund && (
                <div className="flex flex-col">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleForm("refund")}
                    disabled={!!pending}
                    aria-pressed={openForm === "refund"}
                    className="text-danger hover:bg-danger/10"
                  >
                    <Undo2 className="size-4" aria-hidden />
                    Refund Pesanan
                  </Button>
                  <p className="mt-1 max-w-[18rem] text-xs text-neutral-500">
                    {isMidtransMethod(order.payment_method)
                      ? "Refund otomatis lewat Midtrans Direct Refund API."
                      : "Catat refund yang sudah kamu kirim balik ke pembeli secara manual."}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Destructive group — visually separated so users don't fat-finger
          a cancel when they meant something else. */}
      {!isFinal && (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleForm("cancel")}
            disabled={!!pending}
            aria-pressed={openForm === "cancel"}
            className="text-danger hover:bg-danger/10"
          >
            <XCircle className="size-4" aria-hidden />
            Batalkan Pesanan
          </Button>
          <p className="text-xs text-neutral-500">
            {order.status === "pending"
              ? "Tolak pesanan ini sebelum mulai diproses."
              : "Stok produk akan dikembalikan otomatis."}
          </p>
        </div>
      )}

      {/* Inline ship form — submit opens a confirm dialog with the
          inputs as args. */}
      {openForm === "ship" && (
        <div ref={shipFormRef} className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Input Detail Pengiriman
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              Pilih kurir dan masukin nomor resi. Pembeli akan dapat info ini
              di halaman order.
            </p>
          </div>
          <div
            id="ship-form-root"
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
                onClick={() => setOpenForm(null)}
                disabled={!!pending}
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!!pending}
                onClick={() => {
                  const root = document.getElementById("ship-form-root");
                  if (!root) return;
                  const courier = (
                    root.querySelector<HTMLSelectElement>("#ship_courier")?.value ?? ""
                  ).trim();
                  const courierService = (
                    root.querySelector<HTMLInputElement>("#ship_service")?.value ?? ""
                  ).trim();
                  const tracking = (
                    root.querySelector<HTMLInputElement>("#ship_tracking")?.value ?? ""
                  ).trim();
                  if (tracking === "") {
                    showError("Nomor resi wajib diisi.");
                    return;
                  }
                  if (courier === "") {
                    showError("Pilih kurir terlebih dahulu.");
                    return;
                  }
                  setConfirm({
                    kind: "ship",
                    courier,
                    courier_service: courierService,
                    tracking_number: tracking,
                  });
                }}
              >
                <Truck className="size-4" aria-hidden />
                Tandai Dikirim
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inline cancel form — submit opens a confirm dialog with reason. */}
      {openForm === "cancel" && (
        <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Batalkan Pesanan
            </p>
            <p className="mt-0.5 text-xs text-neutral-700">
              Stok produk dikembalikan otomatis. Kalau pembeli sudah bayar,
              pakai{" "}
              <strong>Refund Pesanan</strong> di section Pembayaran.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cancel_reason">Alasan pembatalan</Label>
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
                onClick={() => setOpenForm(null)}
                disabled={!!pending}
              >
                Tutup
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={!!pending}
                onClick={() => {
                  const select = document.getElementById(
                    "cancel_reason",
                  ) as HTMLSelectElement | null;
                  const reason = (select?.value ?? "").trim();
                  if (reason === "") {
                    showError("Pilih alasan pembatalan terlebih dahulu.");
                    return;
                  }
                  setConfirm({
                    kind: "cancel",
                    cancellation_reason: reason,
                  });
                }}
              >
                <XCircle className="size-4" aria-hidden />
                Konfirmasi Batal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inline refund form — opens confirm dialog with amount + reason. */}
      {openForm === "refund" && (
        <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Refund Pesanan
            </p>
            {isMidtransMethod(order.payment_method) ? (
              <p className="mt-0.5 text-xs text-neutral-700">
                Pembayaran ini lewat <strong>Midtrans</strong> ({order.payment_method}).
                Saat kamu konfirmasi, SellOn akan panggil API Midtrans Direct
                Refund pakai Server Key toko-mu - dana otomatis kembali ke
                pembeli. Kalau Midtrans tolak, kamu akan dapat error
                eksplisit.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-neutral-700">
                <strong>Penting:</strong> pembayaran ini bukan via Midtrans
                (
                {order.payment_method
                  ? order.payment_method
                  : "metode tidak tercatat"}
                ). Pastikan kamu sudah kirim balik uangnya secara manual{" "}
                <em>sebelum</em> klik Konfirmasi Refund. Form ini hanya
                mencatat di sistem.
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund_amount">
                Nominal Refund (Rp) *
              </Label>
              <Input
                id="refund_amount"
                type="number"
                min={1}
                max={Math.round(order.total_cents / 100)}
                defaultValue={Math.round(order.total_cents / 100)}
                placeholder={String(Math.round(order.total_cents / 100))}
              />
              <p className="text-xs text-neutral-500">
                Total pesanan: {formatRupiah(order.total_cents)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund_reason">Alasan Refund *</Label>
              <Select
                id="refund_reason"
                defaultValue={refundReasons[0]}
              >
                {refundReasons.map((rr) => (
                  <option key={rr} value={rr}>
                    {rr}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpenForm(null)}
              disabled={!!pending}
            >
              Tutup
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!!pending}
              onClick={() => {
                const amountInput = document.getElementById(
                  "refund_amount",
                ) as HTMLInputElement | null;
                const reasonSelect = document.getElementById(
                  "refund_reason",
                ) as HTMLSelectElement | null;
                const amountRupiah = parseInt(amountInput?.value ?? "0", 10);
                const reason = (reasonSelect?.value ?? "").trim();
                if (!amountRupiah || amountRupiah <= 0) {
                  showError("Nominal refund harus lebih dari 0.");
                  return;
                }
                const totalRupiah = Math.round(order.total_cents / 100);
                if (amountRupiah > totalRupiah) {
                  showError(
                    `Nominal refund tidak boleh melebihi total pesanan (${formatRupiah(order.total_cents)}).`,
                  );
                  return;
                }
                if (reason === "") {
                  showError("Pilih alasan refund.");
                  return;
                }
                setConfirm({
                  kind: "refund",
                  refund_amount_cents: amountRupiah * 100,
                  refund_reason: reason,
                });
              }}
            >
              <Undo2 className="size-4" aria-hidden />
              Konfirmasi Refund
            </Button>
          </div>
        </div>
      )}

      {/* Payment link generator (Midtrans Snap) */}
      {canGeneratePaymentLink && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <Link2 className="size-4 text-brand-600" aria-hidden />
                Kirim Link Bayar Midtrans
                {!paymentGateway.is_configured ? (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                    Belum aktif
                  </span>
                ) : paymentGateway.is_sandbox ? (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                    Sandbox
                  </span>
                ) : (
                  <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
                    Production
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                Buat link Snap untuk pembeli. Mereka klik link → pilih metode
                bayar → status di sini auto-update via webhook. Beda dengan{" "}
                <em>Konfirmasi Pembayaran Manual</em> di atas yang kamu pakai
                kalau pembeli sudah transfer ke rekening sendiri.
              </p>
            </div>
            {!paymentLink && (
              <Button
                size="sm"
                variant="outline"
                onClick={startPaymentLinkFlow}
                disabled={pending === "payment_link"}
                className="shrink-0"
              >
                <Link2 className="size-4" aria-hidden />
                Generate Link
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
                onClick={startPaymentLinkFlow}
                disabled={pending === "payment_link"}
                title="Re-generate link"
              >
                <Link2 className="size-4" aria-hidden />
                Refresh
              </Button>
            </div>
          ) : null}
        </div>
      )}

      
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => (pending ? null : setConfirm(null))}
        onConfirm={runConfirmed}
        title={cfg?.title ?? ""}
        description={cfg?.description ?? ""}
        confirmLabel={cfg?.confirmLabel}
        kind={cfg?.kind}
        busy={!!pending}
        requireTypedPhrase={
          confirm?.kind === "refund" ? "REFUND" : undefined
        }
      />
    </div>
  );
}
