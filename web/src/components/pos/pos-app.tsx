"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Power, ArrowLeft, Clock } from "lucide-react";
import type { Product, Category, POSSession } from "@/lib/types";
import type { Me } from "@/lib/auth-types";
import { POSProvider, usePOS } from "./pos-context";
import { POSHeader } from "./pos-header";
import { ProductGrid } from "./product-grid";
import { CartPanel } from "./cart-panel";
import { PaymentModal } from "./payment-modal";
import { ShiftOpenModal } from "./shift-open-modal";
import { ShiftCloseModal } from "./shift-close-modal";
import { CashMovementModal } from "./cash-movement-modal";
import { HoldOrderPanel } from "./hold-order-panel";
import { SuccessModal } from "./success-modal";

type Props = {
  me: Me;
  products: Product[];
  categories: Category[];
  initialSession: POSSession | null;
};

export function POSApp({ me, products, categories, initialSession }: Props) {
  return (
    <POSProvider>
      <POSAppInner me={me} products={products} categories={categories} initialSession={initialSession} />
    </POSProvider>
  );
}

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function POSAppInner({ me, products, categories, initialSession }: Props) {
  const router = useRouter();
  const { session, setSession, cart, totalCents, clearCart, setLoyaltyConfig, setPrinterConfig, setMidtransLive } = usePOS();

  // Fetch loyalty config + printer config + midtrans status once on mount.
  useEffect(() => {
    fetch(`${apiBase}/api/v1/pos/loyalty/config`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setLoyaltyConfig(d.config))
      .catch(() => {});
    fetch(`${apiBase}/api/v1/pos/printer/config`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPrinterConfig(d.config))
      .catch(() => {});
    fetch(`${apiBase}/api/v1/payments/midtrans`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        // "Live" = configured + verified OK. If configured tapi belum
        // verify, treat as not live untuk safety.
        const live = !!d.gateway?.is_configured && d.gateway?.last_verify_status === "ok";
        setMidtransLive(live);
      })
      .catch(() => setMidtransLive(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCashMovement, setShowCashMovement] = useState(false);
  const [showHold, setShowHold] = useState(false);
  const [successData, setSuccessData] = useState<{
    orderId: string;
    orderNumber: string;
    totalCents: number;
    changeCents: number;
  } | null>(null);

  // On mount: hydrate session from server. Tidak auto-popup modal —
  // user harus klik tombol "Buka Shift Kasir" supaya alur eksplisit.
  useEffect(() => {
    if (initialSession) {
      setSession(initialSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: F8 = bayar, ESC = clear cart
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8" && session && cart.length > 0) {
        e.preventDefault();
        setShowPayment(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, cart.length]);

  if (!session) {
    return (
      <>
        <div className="flex min-h-svh items-center justify-center bg-neutral-50 p-6">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-card">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <Power className="size-7" aria-hidden />
            </div>
            <h1 className="mt-4 font-display text-xl font-semibold text-neutral-900">
              Belum ada shift aktif
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Buka shift kasir terlebih dulu untuk mulai mencatat transaksi penjualan.
            </p>
            <button
              onClick={() => setShowOpenShift(true)}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800"
            >
              <Power className="size-4" aria-hidden />
              Buka Shift Kasir
            </button>
            <div className="mt-3 flex items-center justify-center gap-4 text-xs">
              <Link
                href="/pos/sessions"
                className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900"
              >
                <Clock className="size-3.5" aria-hidden />
                Riwayat Shift
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Kembali ke Dasbor
              </Link>
            </div>
          </div>
        </div>
        {showOpenShift && (
          <ShiftOpenModal
            onSuccess={(s) => {
              setSession(s);
              setShowOpenShift(false);
            }}
            onCancel={() => setShowOpenShift(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-svh w-full flex-col overflow-x-hidden">
      <POSHeader
        me={me}
        session={session}
        onCashMovement={() => setShowCashMovement(true)}
        onHoldOrders={() => setShowHold(true)}
        onCloseShift={() => setShowCloseShift(true)}
      />

      <div className="grid flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(420px,460px)]">
        <ProductGrid products={products} categories={categories} />
        <CartPanel onCheckout={() => setShowPayment(true)} onHold={() => setShowHold(true)} />
      </div>

      {showPayment && (
        <PaymentModal
          totalCents={totalCents}
          onClose={() => setShowPayment(false)}
          onSuccess={(result) => {
            setShowPayment(false);
            setSuccessData({
              orderId: result.order_id,
              orderNumber: result.order_number,
              totalCents: result.total_cents,
              changeCents: result.change_amount_cents,
            });
          }}
        />
      )}

      {showCashMovement && (
        <CashMovementModal
          sessionId={session.id}
          onClose={() => setShowCashMovement(false)}
          onSuccess={() => setShowCashMovement(false)}
        />
      )}

      {showHold && (
        <HoldOrderPanel
          sessionId={session.id}
          onClose={() => setShowHold(false)}
          onRestored={() => setShowHold(false)}
        />
      )}

      {showCloseShift && (
        <ShiftCloseModal
          sessionId={session.id}
          onClose={() => setShowCloseShift(false)}
          onClosed={() => {
            setSession(null);
            router.push("/pos/sessions");
            router.refresh();
          }}
        />
      )}

      {successData && (
        <SuccessModal
          orderId={successData.orderId}
          orderNumber={successData.orderNumber}
          totalCents={successData.totalCents}
          changeCents={successData.changeCents}
          cashierName={me.name || me.email}
          onClose={() => {
            setSuccessData(null);
            clearCart();
          }}
        />
      )}
    </div>
  );
}
