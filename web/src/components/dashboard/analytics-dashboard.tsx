"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  Percent,
  ShoppingBag,
  CheckCircle2,
  Lock,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { formatRupiah } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import type { AnalyticsOverview, CashEntry, ReportOverview } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#6b7280"];

function compactRp(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return String(v);
}

const methodLabel: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  manual_transfer: "Transfer",
  midtrans: "Midtrans",
  edc_debit: "Debit",
  edc_kredit: "Kredit",
  lainnya: "Lainnya",
};

const statusLabel: Record<string, string> = {
  pending: "Menunggu",
  confirmed: "Dikonfirmasi",
  processing: "Diproses",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

// Local YYYY-MM-DD (no UTC shift) so date presets respect the seller's timezone.
function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AnalyticsDashboard({
  report,
  overview,
  entries,
  from,
  to,
  isPaid,
}: {
  report: ReportOverview | null;
  overview: AnalyticsOverview | null;
  entries: CashEntry[];
  from: string;
  to: string;
  isPaid: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  // Sync the date inputs when the applied range changes (preset / navigation,
  // props update without remount). Adjust-during-render pattern (React docs) —
  // no effect, so no cascading-render lint warning.
  const [appliedRange, setAppliedRange] = useState(`${from}|${to}`);
  if (appliedRange !== `${from}|${to}`) {
    setAppliedRange(`${from}|${to}`);
    setF(from);
    setT(to);
  }
  const [busy, setBusy] = useState(false);
  // New cash entry form.
  const [dir, setDir] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState("");
  const [occurredOn, setOccurredOn] = useState(to);
  const [note, setNote] = useState("");

  const applyRange = () => router.push(`/analytics?from=${f}&to=${t}`);

  // Quick-range presets. Each carries its concrete from/to so we can both
  // navigate on click AND highlight the preset matching the current range.
  const presetToday = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(presetToday);
    d.setDate(presetToday.getDate() - n);
    return d;
  };
  const presetDefs = [
    { label: "7 hari", from: ymd(daysAgo(6)), to: ymd(presetToday) },
    { label: "30 hari", from: ymd(daysAgo(29)), to: ymd(presetToday) },
    { label: "90 hari", from: ymd(daysAgo(89)), to: ymd(presetToday) },
    {
      label: "Bulan ini",
      from: ymd(new Date(presetToday.getFullYear(), presetToday.getMonth(), 1)),
      to: ymd(presetToday),
    },
  ];

  const addEntry = async () => {
    if (amount <= 0) {
      showError("Nominal harus > 0");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/cash-entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: dir,
          category: category.trim(),
          amount_cents: Math.round(amount) * 100,
          occurred_on: occurredOn,
          note: note.trim(),
        }),
      });
      if (!res.ok) {
        showError("Gagal menyimpan");
        return;
      }
      showSuccess("Catatan kas tersimpan");
      setAmount(0);
      setCategory("");
      setNote("");
      router.refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  };

  const delEntry = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`${apiBase}/api/v1/cash-entries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const ov = overview;
  const series = (ov?.series ?? []).map((d) => ({
    date: d.date.slice(5), // MM-DD
    revenue: d.revenue_cents / 100,
    masuk: d.in_cents / 100,
    keluar: d.out_cents / 100,
  }));
  const payData = (ov?.payments ?? []).map((p) => ({
    name: methodLabel[p.method] ?? p.method,
    value: p.amount_cents / 100,
  }));

  const headline = report?.headline;
  const topProducts = report?.top_products ?? [];
  const topCustomers = report?.top_customers ?? [];
  const statusBreakdown = report?.status_breakdown ?? {};
  const paymentBreakdown = report?.payment_breakdown ?? {};

  return (
    <div className="flex flex-col gap-6">
      {/* Date range + quick presets */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Dari</label>
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Sampai</label>
          <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="h-9 w-40" />
        </div>
        <Button size="sm" onClick={applyRange}>
          Terapkan
        </Button>
        <div className="flex flex-wrap items-center gap-1.5">
          {presetDefs.map((p) => {
            const active = from === p.from && to === p.to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => router.push(`/analytics?from=${p.from}&to=${p.to}`)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-neutral-200 text-neutral-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sales summary (visible to all plans) ───────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pendapatan" value={formatRupiah(headline?.revenue_cents ?? 0)} />
        <Stat label="Order Berbayar" value={String(headline?.paid_orders ?? 0)} />
        <Stat label="Total Order" value={String(headline?.orders_total ?? 0)} />
        <Stat label="Avg. Order Value" value={formatRupiah(headline?.aov_cents ?? 0)} />
      </div>

      {/* Top products + top customers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <ShoppingBag className="size-4 text-neutral-500" aria-hidden />
            <h2 className="font-semibold text-neutral-900">Produk Terlaris</h2>
          </div>
          {topProducts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
              Belum ada penjualan di periode ini.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 overflow-hidden">
              {topProducts.map((p, i) => (
                <li
                  key={p.product_id || p.product_name}
                  className="flex min-w-0 items-start gap-3 py-3"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-neutral-900">
                      {p.product_name}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-neutral-900">
                      {formatRupiah(p.revenue_cents)}
                      <span className="ml-1 font-normal text-neutral-500">
                        · {p.qty_sold} terjual
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="size-4 text-neutral-500" aria-hidden />
            <h2 className="font-semibold text-neutral-900">Pelanggan Top</h2>
          </div>
          {topCustomers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
              Belum ada pelanggan di periode ini.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 overflow-hidden">
              {topCustomers.map((c) => (
                <li key={c.customer_id} className="min-w-0 py-3">
                  <Link
                    href={`/customers/${c.customer_id}`}
                    className="flex min-w-0 items-center gap-3 hover:text-brand-700"
                  >
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-neutral-900">
                        {c.name}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-neutral-900">
                        {formatRupiah(c.total_spent_cents)}
                        <span className="ml-1 font-normal text-neutral-500">
                          · {c.orders} order
                        </span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Status + payment-method breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-neutral-500" aria-hidden />
            <h2 className="font-semibold text-neutral-900">Status Pesanan</h2>
          </div>
          {Object.keys(statusBreakdown).length === 0 ? (
            <p className="text-sm text-neutral-500">Belum ada data.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(statusBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <li key={status}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm">
                      <span className="font-display text-sm font-bold tabular-nums text-neutral-900">
                        {count}
                      </span>
                      <span className="text-neutral-500">
                        {statusLabel[status] || status}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="size-4 text-neutral-500" aria-hidden />
            <h2 className="font-semibold text-neutral-900">Metode Pembayaran</h2>
          </div>
          {Object.keys(paymentBreakdown).length === 0 ? (
            <p className="text-sm text-neutral-500">Belum ada data.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(paymentBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([method, count]) => (
                  <li key={method}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm">
                      <span className="font-display text-sm font-bold tabular-nums text-neutral-900">
                        {count}
                      </span>
                      <span className="text-neutral-500">
                        {methodLabel[method] || method || "—"}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Financial section (Pro/Bisnis) ─────────────────────────────────── */}
      {isPaid && ov ? (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Percent className="size-4 text-brand-600" aria-hidden />
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              Keuangan & Arus Kas
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="Laba Kotor"
              value={formatRupiah(ov.gross_profit_cents)}
              trend={{
                direction: ov.gross_profit_cents >= 0 ? "up" : "down",
                label: `${ov.margin_pct.toFixed(1)}% margin`,
              }}
            />
            <Stat
              label="Arus Kas Bersih"
              value={formatRupiah(ov.net_cash_cents)}
              trend={{
                direction: ov.net_cash_cents >= 0 ? "up" : "down",
                label: `Masuk ${formatRupiah(ov.cash_in_cents)}`,
              }}
            />
            <Stat
              label="HPP (Biaya Barang)"
              value={formatRupiah(ov.cogs_cents)}
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            💡 Laba & HPP dihitung dari <strong>konsumsi bahan (resep)</strong> +
            biaya dropship. Produk tanpa resep belum punya angka HPP — pasang
            resep di produk biar akurat.
          </div>

          {/* Revenue trend */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="size-4 text-brand-600" aria-hidden />
              <h2 className="font-semibold text-neutral-900">Tren Pendapatan</h2>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tickFormatter={(v) => compactRp(v * 100)} tick={{ fontSize: 11 }} stroke="#9ca3af" width={48} />
                  <Tooltip formatter={(v) => formatRupiah(Number(v) * 100)} />
                  <Area type="monotone" dataKey="revenue" name="Pendapatan" stroke="#10b981" fill="url(#revFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Cash flow */}
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Wallet className="size-4 text-brand-600" aria-hidden />
                <h2 className="font-semibold text-neutral-900">Arus Kas (Masuk vs Keluar)</h2>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tickFormatter={(v) => compactRp(v * 100)} tick={{ fontSize: 11 }} stroke="#9ca3af" width={48} />
                    <Tooltip formatter={(v) => formatRupiah(Number(v) * 100)} />
                    <Legend />
                    <Bar dataKey="masuk" name="Masuk" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="keluar" name="Keluar" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Payment mix (by amount) */}
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Percent className="size-4 text-brand-600" aria-hidden />
                <h2 className="font-semibold text-neutral-900">Metode Pembayaran (Rupiah)</h2>
              </div>
              {payData.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-500">Belum ada penjualan di periode ini.</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={payData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {payData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatRupiah(Number(v) * 100)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Cash ledger */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <ShoppingBag className="size-4 text-brand-600" aria-hidden />
              <h2 className="font-semibold text-neutral-900">Catatan Kas Manual</h2>
            </div>
            <p className="mb-3 text-sm text-neutral-500">
              Catat pengeluaran operasional (sewa, gaji, listrik) atau pemasukan lain. Penjualan & belanja bahan dihitung otomatis.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Select value={dir} onChange={(e) => setDir(e.target.value as "in" | "out")} className="w-28">
                <option value="out">Keluar</option>
                <option value="in">Masuk</option>
              </Select>
              <div className="relative w-36">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">Rp</span>
                <Input
                  inputMode="numeric"
                  value={amount ? amount.toLocaleString("id-ID") : ""}
                  onChange={(e) => setAmount(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)}
                  placeholder="Nominal"
                  className="pl-7 text-right"
                />
              </div>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kategori (sewa, gaji)" className="w-40" />
              <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} className="w-40" />
              <Button size="sm" onClick={addEntry} disabled={busy}>
                <Plus className="size-4" aria-hidden />
                Catat
              </Button>
            </div>

            {entries.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-100 text-neutral-500">
                    <tr>
                      <th className="py-2 text-left font-medium">Tanggal</th>
                      <th className="py-2 text-left font-medium">Kategori</th>
                      <th className="py-2 text-left font-medium">Arah</th>
                      <th className="py-2 text-right font-medium">Nominal</th>
                      <th className="w-px py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 text-neutral-600">{e.occurred_on}</td>
                        <td className="py-2 text-neutral-900">
                          {e.category || "—"}
                          {e.note ? ` · ${e.note}` : ""}
                        </td>
                        <td className="py-2">
                          <span className={e.direction === "in" ? "text-success" : "text-danger"}>
                            {e.direction === "in" ? "Masuk" : "Keluar"}
                          </span>
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">{formatRupiah(e.amount_cents)}</td>
                        <td className="py-2">
                          <button
                            onClick={() => delEntry(e.id)}
                            className="flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-danger/10 hover:text-danger"
                            aria-label="Hapus"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        // Free tier: financial depth is the upgrade lever.
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50/60 to-white py-10 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Lock className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Keuangan & Arus Kas tersedia di Pro
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Buka laba kotor & margin, chart tren pendapatan, arus kas masuk/keluar,
            catatan kas operasional, dan rangkuman AI — untuk keputusan bisnis yang
            lebih cepat dan akurat.
          </p>
          <Link href="/settings/subscription" className="mt-5 inline-block">
            <Button size="sm">
              <Zap className="size-4" aria-hidden />
              Upgrade ke Pro
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
