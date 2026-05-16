"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Crown,
  X,
  Loader2,
  AlertCircle,
  TrendingUp,
  ShoppingBag,
  Users,
  Lightbulb,
  Clock,
} from "lucide-react";

const loadingTexts = [
  "Sedang membaca data penjualanmu…",
  "Menganalisa produk terlaris…",
  "Melihat pola perilaku pelanggan…",
  "Menghitung tren revenue…",
  "Menyusun rekomendasi untukmu…",
  "Hampir selesai…",
];
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/toast";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type InsightData = {
  ringkasan: string;
  produk_insight: string;
  pelanggan_insight: string;
  rekomendasi: string[];
  cached_at?: string;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "insufficient_data"; daysSinceFirst: number; minDays: number }
  | { kind: "result"; data: InsightData }
  | { kind: "error"; message: string };

type Props = { isPaid: boolean };

export function AiInsightButton({ isPaid }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
    const onCancel = (e: Event) => {
      e.preventDefault();
      setState({ kind: "idle" });
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d) setState({ kind: "idle" });
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  async function analyze() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${apiBase}/api/v1/reports/ai-insight`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 422 && data.error === "insufficient_data") {
        setState({
          kind: "insufficient_data",
          daysSinceFirst: data.days_since_first_order ?? 0,
          minDays: data.min_days_required ?? 14,
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: data.message || "Analisa gagal. Coba lagi dalam beberapa menit.",
        });
        return;
      }

      setState({ kind: "result", data: data as InsightData });
    } catch {
      setState({ kind: "error", message: "Koneksi gagal. Periksa internet kamu." });
    }
  }

  function close() {
    setState({ kind: "idle" });
  }

  const isDialogOpen = state.kind !== "idle";

  return (
    <>
      {isPaid ? (
        <button
          type="button"
          onClick={analyze}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700"
        >
          <Sparkles className="size-3.5" aria-hidden />
          Analisa AI
        </button>
      ) : (
        <button
          type="button"
          disabled
          title="Fitur eksklusif Pro & Bisnis"
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-400 cursor-not-allowed"
        >
          <Crown className="size-3.5" aria-hidden />
          Analisa AI
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="ai-insight-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(600px,95vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 text-left shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Sparkles className="size-4" aria-hidden />
          </div>
          <div className="flex-1">
            <h2 id="ai-insight-title" className="font-display text-base font-semibold text-neutral-900">
              Analisa AI
            </h2>
            <p className="text-xs text-neutral-500">Insight bisnis berbasis data order-mu</p>
          </div>
          {state.kind !== "loading" && (
            <button
              type="button"
              onClick={close}
              aria-label="Tutup"
              className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 60px)" }}>
          {/* Loading */}
          {state.kind === "loading" && (
            <div className="flex flex-col items-center justify-center gap-5 px-6 py-16">
              {/* Spinner */}
              <div className="relative">
                <div className="size-20 rounded-full border-4 border-brand-100" />
                <div className="absolute inset-0 size-20 rounded-full border-4 border-transparent border-t-brand-500 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto size-8 text-brand-500" aria-hidden />
              </div>

              {/* Rotating text */}
              <div className="text-center">
                <p
                  className="font-semibold text-neutral-900 transition-opacity duration-300"
                  style={{ opacity: fade ? 1 : 0 }}
                >
                  {loadingTexts[loadingIdx]}
                </p>
                <p className="mt-1 text-xs text-neutral-400">Claude AI · Haiku 4.5</p>
              </div>

              {/* Animated dots */}
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

          {/* Insufficient data */}
          {state.kind === "insufficient_data" && (
            <div className="p-6">
              {/* Ilustrasi */}
              <div className="relative mb-6 flex justify-center">
                <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-warning/20 to-warning/5">
                  <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-warning/30 to-warning/10">
                    <Clock className="size-8 text-warning" aria-hidden />
                  </div>
                </div>
                {/* Decorative dots */}
                <span className="absolute left-1/2 top-0 -translate-x-12 size-2 rounded-full bg-warning/40" />
                <span className="absolute left-1/2 bottom-0 translate-x-10 size-1.5 rounded-full bg-brand-300/60" />
                <span className="absolute right-1/2 top-3 translate-x-16 size-1 rounded-full bg-warning/30" />
              </div>

              {/* Teks */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-neutral-900">Data order belum cukup</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  Fitur Analisa AI aktif setelah kamu memiliki data order minimal{" "}
                  <strong className="text-neutral-800">{state.minDays} hari</strong>.
                </p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                  Saat ini kamu baru{" "}
                  <strong className="text-neutral-800">{state.daysSinceFirst} hari</strong>{" "}
                  berjualan.
                </p>
              </div>

              {/* Progress */}
              <div className="mt-6 rounded-xl bg-neutral-50 p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-medium">
                  <span className="text-neutral-500">Progress menuju Analisa AI</span>
                  <span className="text-warning">{state.daysSinceFirst}/{state.minDays} hari</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-warning/80 to-warning transition-all duration-500"
                    style={{ width: `${Math.min(100, (state.daysSinceFirst / state.minDays) * 100)}%` }}
                  />
                </div>
                <p className="mt-3 text-center text-xs text-neutral-500">
                  Semakin banyak order masuk, semakin kaya insight yang AI bisa berikan 🚀
                </p>
              </div>

              <div className="mt-5 flex justify-end">
                <Button type="button" size="sm" variant="ghost" onClick={close}>
                  Tutup
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {state.kind === "error" && (
            <div className="p-6">
              <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
                <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />
                <div>
                  <p className="font-medium text-neutral-900">Analisa gagal</p>
                  <p className="mt-0.5 text-sm text-neutral-600">{state.message}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={close}>Tutup</Button>
                <Button type="button" size="sm" onClick={analyze}>Coba lagi</Button>
              </div>
            </div>
          )}

          {/* Result */}
          {state.kind === "result" && (
            <div className="p-5">
              {/* Cache badge */}
              {state.data.cached_at && (
                <div className="mb-4 flex items-center gap-1.5 text-xs text-neutral-400">
                  <Clock className="size-3" aria-hidden />
                  Dari cache · dianalisa {formatRelativeTime(state.data.cached_at)}
                </div>
              )}

              <div className="flex flex-col gap-4">
                {/* Ringkasan */}
                <InsightSection
                  icon={<TrendingUp className="size-4" />}
                  label="Ringkasan Performa"
                  color="brand"
                  content={<p className="text-sm text-neutral-700 leading-relaxed">{state.data.ringkasan}</p>}
                />

                {/* Produk */}
                <InsightSection
                  icon={<ShoppingBag className="size-4" />}
                  label="Insight Produk"
                  color="success"
                  content={<p className="text-sm text-neutral-700 leading-relaxed">{state.data.produk_insight}</p>}
                />

                {/* Pelanggan */}
                <InsightSection
                  icon={<Users className="size-4" />}
                  label="Perilaku Pelanggan"
                  color="warning"
                  content={<p className="text-sm text-neutral-700 leading-relaxed">{state.data.pelanggan_insight}</p>}
                />

                {/* Rekomendasi */}
                <InsightSection
                  icon={<Lightbulb className="size-4" />}
                  label="Rekomendasi Aksi"
                  color="purple"
                  content={
                    <ol className="flex flex-col gap-2">
                      {(state.data.rekomendasi ?? []).map((tip, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{tip}</span>
                        </li>
                      ))}
                    </ol>
                  }
                />
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-4">
                <p className="text-xs text-neutral-400">
                  Dianalisa oleh Claude AI · berlaku 24 jam
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={close}>
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

function InsightSection({
  icon,
  label,
  color,
  content,
}: {
  icon: React.ReactNode;
  label: string;
  color: "brand" | "success" | "warning" | "purple";
  content: React.ReactNode;
}) {
  const colorMap = {
    brand:   { bg: "bg-brand-50",   icon: "text-brand-700",   border: "border-brand-100" },
    success: { bg: "bg-success/5",  icon: "text-success",      border: "border-success/20" },
    warning: { bg: "bg-warning/5",  icon: "text-warning",      border: "border-warning/20" },
    purple:  { bg: "bg-purple-50",  icon: "text-purple-700",   border: "border-purple-100" },
  }[color];

  return (
    <div className={`rounded-xl border p-4 ${colorMap.bg} ${colorMap.border}`}>
      <div className={`mb-2.5 flex items-center gap-2 font-semibold text-neutral-900 ${colorMap.icon}`}>
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      {content}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}
