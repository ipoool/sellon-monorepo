"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, RotateCcw } from "lucide-react";

import { formatRupiah } from "@/lib/format";
import type { CartItem } from "@/components/storefront/cart-context";
import type { PublicPayment } from "./types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// How long the confirmation screen stays up before auto-resetting for the next
// customer, and how long an unpaid "pay" screen waits before giving up.
const CONFIRM_RESET_MS = 25_000;
const PAY_ABANDON_MS = 120_000;
const POLL_MS = 3_000;

type Stage = "creating" | "pay" | "confirmed" | "abandoned" | "error";
type Method = "midtrans" | "qris" | "cashier";

type CreatedOrder = { order_number: string; queue_number: number | null; total_cents: number };

function pickMethod(payment?: PublicPayment): Method {
  if (payment?.has_midtrans) return "midtrans";
  if (payment?.has_qris_static) return "qris";
  return "cashier";
}

// Stable internal payment-method codes (not free-text labels) — the backend
// maps these to human copy for WA/email/dashboard. Mirrors the codes the
// table self-order flow already sends.
function methodCode(m: Method): string {
  if (m === "midtrans") return "midtrans";
  if (m === "qris") return "qris";
  return "cashier";
}

export function KioskPaymentScreen({
  slug,
  storeName,
  payment,
  items,
  onSuccess,
  onCancel,
}: {
  slug: string;
  storeName?: string;
  payment?: PublicPayment;
  items: CartItem[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const method = pickMethod(payment);
  const [stage, setStage] = useState<Stage>("creating");
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [qrisUrl, setQrisUrl] = useState("");
  const [paying, setPaying] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [attempt, setAttempt] = useState(0); // retrying re-runs the create effect
  // The method actually used to settle — may downgrade to "cashier" if an
  // online method can't be presented (e.g. Snap link fails, QRIS image gone).
  // Drives the confirmation copy so we never claim "paid" on an unpaid order.
  const [resolvedMethod, setResolvedMethod] = useState<Method>(method);
  const [countdown, setCountdown] = useState(Math.round(CONFIRM_RESET_MS / 1000));
  const createdRef = useRef(false);
  // One key per checkout attempt, reused by the retry button so a re-POST after
  // a network error can't create a second order for the same cart. The public
  // storefront CreateOrder does not honour it yet (only the POS path does) —
  // harmless extra field until it does; the retry guard below is the real
  // protection in the meantime.
  const idempotencyKeyRef = useRef<string | null>(null);
  const idempotencyKey = () => {
    if (idempotencyKeyRef.current == null) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    return idempotencyKeyRef.current;
  };

  // Create the order once, then branch into the right payment presentation.
  // createdRef is the single source of dedupe (covers React Strict-Mode's
  // double-invoke). We deliberately do NOT abort the in-flight request on
  // cleanup: under Strict Mode the first cleanup would kill the only request
  // the ref-guard allows, leaving the screen stuck. setState after a real
  // unmount is a harmless no-op in React 19.
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/storefront/${slug}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "kiosk",
            payment_method: methodCode(method),
            idempotency_key: idempotencyKey(),
            items: items.map((it) => ({
              product_id: it.product_id,
              variant_id: it.variant_id,
              quantity: it.qty,
              selected_option_ids: (it.selected_options ?? []).map((o) => o.option_id),
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrMsg(data.error || "Gagal membuat pesanan");
          setStage("error");
          return;
        }
        const created: CreatedOrder = {
          order_number: data.order_number,
          queue_number: data.queue_number ?? null,
          total_cents: data.total_cents ?? 0,
        };
        setOrder(created);

        if (method === "cashier") {
          setStage("confirmed");
          return;
        }
        if (method === "midtrans") {
          const linkRes = await fetch(
            `${apiBase}/api/v1/storefront/${slug}/orders/${created.order_number}/payment-link`,
            { method: "POST" },
          );
          const linkData = await linkRes.json().catch(() => ({}));
          if (linkRes.ok && linkData.payment_url) {
            setPaymentUrl(linkData.payment_url);
            setStage("pay");
          } else {
            // Couldn't get a Snap link — degrade to pay-at-cashier so we don't
            // show a "payment succeeded" screen for an order nobody paid.
            setResolvedMethod("cashier");
            setStage("confirmed");
          }
          return;
        }
        // QRIS static: fetch the order to read the store's QRIS image.
        const ordRes = await fetch(
          `${apiBase}/api/v1/storefront/${slug}/orders/${created.order_number}`,
        );
        const ordData = await ordRes.json().catch(() => ({}));
        const qris = (ordData.bank_accounts ?? [])
          .map((b: { qris_url?: string }) => b.qris_url)
          .find((u: string | undefined) => !!u);
        if (qris) setQrisUrl(qris);
        setStage("pay");
      } catch {
        setErrMsg("Gagal terhubung ke server");
        setStage("error");
      }
    })();
    // attempt drives manual retry; createdRef is reset before bumping it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Midtrans: poll the order until the webhook flips it to paid.
  useEffect(() => {
    if (stage !== "pay" || method !== "midtrans" || !order) return;
    let alive = true;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/v1/storefront/${slug}/orders/${order.order_number}`,
        );
        if (!res.ok || !alive) return;
        // GET /storefront/{slug}/orders/{number} answers
        // { store, order, bank_accounts } — payment_status lives on `order`.
        // Reading data.payment_status was always undefined, so a paid order
        // was never detected and the abandon timer eventually fired.
        const data = await res.json();
        if (data.order?.payment_status === "paid") {
          clearInterval(poll);
          setStage("confirmed");
        }
      } catch {
        /* transient — keep polling */
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [stage, method, order, slug]);

  // Abandon timer on the pay screen (buyer walked away). The order already
  // EXISTS at this point, so dropping back into the cart invited a second
  // order (and a second payment) for the same items — show the created order
  // and let the reset clear the cart instead.
  useEffect(() => {
    if (stage !== "pay") return;
    const t = setTimeout(() => {
      if (order) setStage("abandoned");
      else onCancel();
    }, PAY_ABANDON_MS);
    return () => clearTimeout(t);
  }, [stage, order, onCancel]);

  // Auto-reset after a confirmation so the kiosk is ready for the next customer,
  // with a visible countdown. The component remounts per order, so `countdown`
  // starts fresh each time and the interval only runs while confirmed.
  useEffect(() => {
    if (stage !== "confirmed" && stage !== "abandoned") return;
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    const done = setTimeout(onSuccess, CONFIRM_RESET_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [stage, onSuccess]);

  const markQrisPaid = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/storefront/${slug}/orders/${order.order_number}/mark-paid`,
        { method: "POST" },
      );
      if (!res.ok) {
        setErrMsg("Gagal menandai pembayaran — coba lagi atau bayar di kasir");
        setStage("error");
        return;
      }
      setStage("confirmed");
    } catch {
      setErrMsg("Gagal terhubung — coba lagi atau bayar di kasir");
      setStage("error");
    } finally {
      setPaying(false);
    }
  };

  // QRIS configured but the image is missing (removed mid-session) — let the
  // buyer continue as a cashier-pay order instead of self-marking a phantom QRIS.
  const fallbackToCashier = () => {
    setResolvedMethod("cashier");
    setStage("confirmed");
  };

  const retry = () => {
    setErrMsg("");
    // The order may already have been created (the failure can happen after
    // the POST — e.g. the follow-up payment-link/order fetch). Re-POSTing then
    // would duplicate it, so recover the existing order instead.
    if (order) {
      setResolvedMethod("cashier");
      setStage("confirmed");
      return;
    }
    createdRef.current = false;
    setStage("creating");
    setAttempt((a) => a + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-50 text-neutral-900">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-6 py-4 text-center">
        <p className="font-display text-lg font-bold text-neutral-900">{storeName ?? "Pesanan"}</p>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
        {stage === "creating" && (
          <div className="flex flex-col items-center gap-4 text-neutral-500">
            <Loader2 className="size-10 animate-spin text-brand-600" aria-hidden />
            <p>Membuat pesanan…</p>
          </div>
        )}

        {stage === "error" && (
          <div className="flex max-w-sm flex-col items-center gap-4">
            <AlertCircle className="size-12 text-red-500" aria-hidden />
            <p className="text-lg font-semibold text-neutral-900">{errMsg || "Terjadi kesalahan"}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={retry}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
              >
                <RotateCcw className="size-4" aria-hidden />
                Coba lagi
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-neutral-300 px-5 py-3 font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                Kembali
              </button>
            </div>
          </div>
        )}

        {stage === "pay" && order && (
          <div className="flex w-full max-w-sm flex-col items-center gap-5">
            <p className="text-neutral-500">Total bayar</p>
            <p className="font-display text-4xl font-bold tabular-nums text-neutral-900">
              {formatRupiah(order.total_cents)}
            </p>

            {method === "midtrans" && paymentUrl && (
              <>
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-card">
                  <QRCodeSVG value={paymentUrl} size={220} />
                </div>
                <p className="text-sm text-neutral-500">
                  Scan QR ini dengan kamera HP untuk membuka halaman pembayaran (QRIS /
                  e-wallet / VA). Nomor antrian muncul otomatis setelah pembayaran berhasil.
                </p>
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  Buka halaman pembayaran
                </a>
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Menunggu pembayaran…
                </div>
              </>
            )}

            {method === "qris" && (
              <>
                {qrisUrl ? (
                  <>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrisUrl} alt="QRIS" className="size-56 object-contain" />
                    </div>
                    <p className="text-sm text-neutral-500">
                      Scan QRIS lalu bayar sesuai total di atas.
                    </p>
                    <button
                      type="button"
                      onClick={markQrisPaid}
                      disabled={paying}
                      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {paying ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                      Saya sudah bayar
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-neutral-500">
                      QRIS belum tersedia — lanjutkan dan bayar di kasir.
                    </p>
                    <button
                      type="button"
                      onClick={fallbackToCashier}
                      className="flex h-14 w-full items-center justify-center rounded-2xl bg-brand-600 text-base font-semibold text-white hover:bg-brand-700"
                    >
                      Lanjut
                    </button>
                  </>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-neutral-400 hover:text-neutral-600"
            >
              Batal
            </button>
          </div>
        )}

        {stage === "abandoned" && order && (
          <div className="flex flex-col items-center gap-5">
            <AlertCircle className="size-14 text-amber-500" aria-hidden />
            <p className="text-lg font-semibold text-neutral-900">
              Pesanan sudah dibuat
            </p>
            {order.queue_number != null ? (
              <div className="rounded-3xl bg-amber-50 px-12 py-8 ring-2 ring-amber-200">
                <p className="text-sm font-medium text-amber-700">Nomor Antrian</p>
                <p className="font-display text-7xl font-bold tabular-nums text-amber-600">
                  {order.queue_number}
                </p>
              </div>
            ) : (
              <p className="font-display text-3xl font-bold text-neutral-900">
                {order.order_number}
              </p>
            )}
            <p className="max-w-xs text-sm text-neutral-500">
              Pembayaran belum kami terima. Tunjukkan nomor ini ke kasir untuk
              menyelesaikan pembayaran — jangan pesan ulang biar tidak dobel.
            </p>
            <button
              type="button"
              onClick={onSuccess}
              className="rounded-2xl bg-brand-600 px-8 py-4 text-base font-semibold text-white hover:bg-brand-700"
            >
              Selesai
            </button>
            <p className="text-sm text-neutral-400" aria-live="polite">
              Kembali ke menu dalam {countdown} detik
            </p>
          </div>
        )}

        {stage === "confirmed" && order && (
          <div className="flex flex-col items-center gap-5">
            <CheckCircle2 className="size-14 text-emerald-500" aria-hidden />
            <p className="text-lg font-semibold text-neutral-900">Pesanan diterima!</p>
            {order.queue_number != null ? (
              <div className="rounded-3xl bg-emerald-50 px-12 py-8 ring-2 ring-emerald-200">
                <p className="text-sm font-medium text-emerald-700">Nomor Antrian</p>
                <p className="font-display text-7xl font-bold tabular-nums text-emerald-600">
                  {order.queue_number}
                </p>
              </div>
            ) : (
              <p className="font-display text-3xl font-bold text-neutral-900">{order.order_number}</p>
            )}
            <p className="max-w-xs text-sm text-neutral-500">
              {resolvedMethod === "cashier"
                ? "Tunjukkan nomor ini ke kasir untuk membayar & mengambil pesanan."
                : resolvedMethod === "qris"
                  ? "Pembayaran sedang diverifikasi kasir. Tunjukkan nomor ini saat mengambil pesanan."
                  : "Pembayaran berhasil. Tunjukkan nomor ini saat mengambil pesanan."}
            </p>
            <button
              type="button"
              onClick={onSuccess}
              className="rounded-2xl bg-brand-600 px-8 py-4 text-base font-semibold text-white hover:bg-brand-700"
            >
              Pesanan Baru
            </button>
            <p className="text-sm text-neutral-400" aria-live="polite">
              Kembali ke menu dalam {countdown} detik
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
