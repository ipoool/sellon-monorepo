"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Sparkles,
  Crown,
  X,
  AlertCircle,
  FileText,
  Wallet,
  TrendingUp,
  Lightbulb,
  PackagePlus,
  PackageSearch,
  SquarePen,
  ArrowRight,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const loadingTexts = [
  "Sedang membaca data keuangan tokomu…",
  "Menghitung laba & margin…",
  "Menganalisa arus kas masuk/keluar…",
  "Melihat tren penjualan harian…",
  "Menyusun rekomendasi untukmu…",
  "Hampir selesai…",
];

type ProductNote = { nama: string; detail: string; product_id?: string };

type SummaryData = {
  ringkasan: string;
  arus_kas: string;
  tren: string;
  pelanggan?: string;
  produk_restok?: ProductNote[];
  produk_optimasi?: ProductNote[];
  rekomendasi: string[];
  cached_at?: string;
};

// Format an ISO timestamp into a readable Indonesian date-time, e.g.
// "30 Mei 2026, 20.15". Empty/invalid input returns "".
function formatGeneratedAt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; data: SummaryData }
  | { kind: "error"; message: string };

type Props = { from: string; to: string; isPaid: boolean };

export function AnalyticsAiButton({ from, to, isPaid }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const esRef = useRef<EventSource | null>(null);
  // DashboardShell renders `actions` twice (desktop + mobile blocks), each
  // inside a breakpoint-`display:none` container. A native <dialog> nested in a
  // hidden ancestor won't render, so we portal it to <body> instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (state.kind !== "loading") return;
    setLoadingIdx(0);
    setFade(true);
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setLoadingIdx((i) => (i + 1) % loadingTexts.length);
        setFade(true);
      }, 300);
    }, 2000);
    return () => clearInterval(interval);
  }, [state.kind]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const isOpen = state.kind !== "idle";
    if (isOpen && !d.open) d.showModal();
    if (!isOpen && d.open) d.close();
  }, [state.kind]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    // ESC closes (and aborts any in-flight request). Backdrop clicks are
    // intentionally ignored so the user can't lose a running summary by
    // mis-clicking outside the dialog.
    const onCancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("cancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function analyze() {
    // Close any prior stream before starting a new one.
    esRef.current?.close();
    setState({ kind: "loading" });

    const params = new URLSearchParams({ from, to });
    // SSE: the server heartbeats while Claude works, so the connection never
    // times out (the old POST could hit ERR_EMPTY_RESPONSE on slow generations).
    const es = new EventSource(
      `${apiBase}/api/v1/analytics/ai-summary/stream?${params.toString()}`,
      { withCredentials: true },
    );
    esRef.current = es;

    es.addEventListener("result", (e) => {
      es.close();
      esRef.current = null;
      try {
        const data = JSON.parse((e as MessageEvent).data) as SummaryData;
        setState({ kind: "result", data });
      } catch {
        setState({ kind: "error", message: "Rangkuman tidak valid. Coba lagi." });
      }
    });

    es.addEventListener("failed", (e) => {
      es.close();
      esRef.current = null;
      let message = "Rangkuman gagal. Coba lagi dalam beberapa menit.";
      try {
        const d = JSON.parse((e as MessageEvent).data);
        if (d?.message) message = d.message;
      } catch {
        /* keep default */
      }
      setState({ kind: "error", message });
    });

    es.onerror = () => {
      // Network/connection drop. Only surface if we're still waiting — a normal
      // stream-end after "result"/"failed" also fires this.
      es.close();
      esRef.current = null;
      setState((s) =>
        s.kind === "loading"
          ? { kind: "error", message: "Koneksi gagal. Periksa internet kamu." }
          : s,
      );
    };
  }

  function close() {
    // Closing the stream cancels the server-side AI call (tied to request ctx),
    // so we don't waste a generation the user no longer wants to wait for.
    esRef.current?.close();
    esRef.current = null;
    setState({ kind: "idle" });
  }

  return (
    <>
      {isPaid ? (
        <button
          type="button"
          onClick={analyze}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700"
        >
          <Sparkles className="size-3.5" aria-hidden />
          Rangkum dengan AI
        </button>
      ) : (
        <Link
          href="/settings/subscription"
          title="Fitur eksklusif paket Pro & Bisnis"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white no-underline shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700"
        >
          <Crown className="size-3.5" aria-hidden />
          Rangkum dengan AI
        </Link>
      )}

      {mounted &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-labelledby="analytics-ai-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(1040px,96vw)] max-h-[94vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 text-left shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Sparkles className="size-4" aria-hidden />
          </div>
          <div className="flex-1">
            <h2
              id="analytics-ai-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Rangkuman AI
            </h2>
            <p className="text-xs text-neutral-500">
              Analytics tokomu dijelaskan dengan bahasa sederhana
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={state.kind === "loading" ? "Batalkan & tutup" : "Tutup"}
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 60px)" }}>
          {/* Loading */}
          {state.kind === "loading" && (
            <div className="flex flex-col items-center justify-center gap-5 px-6 py-16">
              <div className="relative">
                <div className="size-20 rounded-full border-4 border-brand-100" />
                <div className="absolute inset-0 size-20 rounded-full border-4 border-transparent border-t-brand-500 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto size-8 text-brand-500" aria-hidden />
              </div>
              <div className="text-center">
                <p
                  className="font-semibold text-neutral-900 transition-opacity duration-300"
                  style={{ opacity: fade ? 1 : 0 }}
                >
                  {loadingTexts[loadingIdx]}
                </p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="size-2 rounded-full bg-brand-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {state.kind === "error" && (
            <div className="p-6">
              <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
                <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />
                <div>
                  <p className="font-medium text-neutral-900">Rangkuman gagal</p>
                  <p className="mt-0.5 text-sm text-neutral-600">{state.message}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={close}>
                  Tutup
                </Button>
                <Button type="button" size="sm" onClick={analyze}>
                  Coba lagi
                </Button>
              </div>
            </div>
          )}

          {/* Result — large view with a tab per section */}
          {state.kind === "result" && (
            <ResultTabs data={state.data} onClose={close} />
          )}
        </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

function ProductNoteList({
  items,
  tone,
  actionLabel,
}: {
  items: ProductNote[];
  tone: "danger" | "sky";
  actionLabel: string;
}) {
  const t =
    tone === "danger"
      ? {
          border: "border-danger/20",
          bg: "bg-danger/5",
          ring: "bg-danger",
          num: "bg-danger/10 text-danger",
        }
      : {
          border: "border-sky-100",
          bg: "bg-sky-50",
          ring: "bg-sky-500",
          num: "bg-sky-100 text-sky-700",
        };

  return (
    <ul className="flex flex-col gap-3">
      {items.map((p, i) => (
        <li
          key={i}
          className={`relative overflow-hidden rounded-xl border ${t.border} ${t.bg} p-4`}
        >
          {/* left accent bar */}
          <span className={`absolute inset-y-0 left-0 w-1 ${t.ring}`} aria-hidden />
          <div className="flex items-start gap-3 pl-2">
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.num}`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-neutral-900">{p.nama}</p>
              {p.detail ? (
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                  {p.detail}
                </p>
              ) : null}
              {p.product_id ? (
                <Link
                  href={`/products/${p.product_id}`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 no-underline shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  <SquarePen className="size-3.5" aria-hidden />
                  {actionLabel}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-700">
      {text}
    </p>
  );
}

function RekomendasiList({ items }: { items: string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((tip, i) => (
        <li key={i} className="flex items-start gap-3 text-[15px] text-neutral-700">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {i + 1}
          </span>
          <span className="leading-relaxed">{tip}</span>
        </li>
      ))}
    </ol>
  );
}

type Tab = {
  key: string;
  label: string;
  Icon: typeof FileText;
  accent: string;
  node: React.ReactNode;
};

function ResultTabs({
  data,
  onClose,
}: {
  data: SummaryData;
  onClose: () => void;
}) {
  const restok = data.produk_restok ?? [];
  const optimasi = data.produk_optimasi ?? [];
  const rekomendasi = data.rekomendasi ?? [];
  const generatedAt = formatGeneratedAt(data.cached_at);

  const tabs: Tab[] = [
    {
      key: "ringkasan",
      label: "Ringkasan",
      Icon: FileText,
      accent: "text-brand-700",
      node: <Prose text={data.ringkasan} />,
    },
    {
      key: "arus_kas",
      label: "Arus Kas",
      Icon: Wallet,
      accent: "text-success",
      node: <Prose text={data.arus_kas} />,
    },
    {
      key: "tren",
      label: "Tren Penjualan",
      Icon: TrendingUp,
      accent: "text-warning",
      node: <Prose text={data.tren} />,
    },
    ...(data.pelanggan
      ? [
          {
            key: "pelanggan",
            label: "Pelanggan",
            Icon: Users,
            accent: "text-purple-700",
            node: <Prose text={data.pelanggan} />,
          } as Tab,
        ]
      : []),
    ...(restok.length > 0
      ? [
          {
            key: "restok",
            label: "Perlu Restok",
            Icon: PackagePlus,
            accent: "text-danger",
            node: (
              <ProductNoteList
                items={restok}
                tone="danger"
                actionLabel="Update stok produk"
              />
            ),
          } as Tab,
        ]
      : []),
    ...(optimasi.length > 0
      ? [
          {
            key: "optimasi",
            label: "Perlu Dioptimalkan",
            Icon: PackageSearch,
            accent: "text-sky-700",
            node: (
              <ProductNoteList
                items={optimasi}
                tone="sky"
                actionLabel="Edit produk"
              />
            ),
          } as Tab,
        ]
      : []),
    ...(rekomendasi.length > 0
      ? [
          {
            key: "rekomendasi",
            label: "Rekomendasi",
            Icon: Lightbulb,
            accent: "text-purple-700",
            node: <RekomendasiList items={rekomendasi} />,
          } as Tab,
        ]
      : []),
  ];

  const [active, setActive] = useState(tabs[0]?.key ?? "ringkasan");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="flex h-[min(86vh,760px)] flex-col">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Bagian rangkuman"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200 px-3"
      >
        {tabs.map((t) => {
          const isActive = t.key === current.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "text-brand-700"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <t.Icon className="size-4" aria-hidden />
              {t.label}
              {isActive && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-3 flex items-center gap-2">
          <current.Icon className={`size-4 ${current.accent}`} aria-hidden />
          <h3 className="font-display text-base font-semibold text-neutral-900">
            {current.label}
          </h3>
        </div>
        {current.node}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-100 px-6 py-3">
        <p className="text-xs text-neutral-400">
          {generatedAt
            ? `Terakhir di-generate AI: ${generatedAt}`
            : "Dianalisa oleh Claude AI berdasarkan data periode terpilih"}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}
