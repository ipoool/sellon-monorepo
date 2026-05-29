"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Plus, Trash2, Wallet, TrendingUp, Percent, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatRupiah } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import type { AnalyticsOverview, CashEntry } from "@/lib/types";

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

export function AnalyticsDashboard({
  overview,
  entries,
  from,
  to,
}: {
  overview: AnalyticsOverview | null;
  entries: CashEntry[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [busy, setBusy] = useState(false);
  // New cash entry form.
  const [dir, setDir] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState("");
  const [occurredOn, setOccurredOn] = useState(to);
  const [note, setNote] = useState("");

  const applyRange = () => router.push(`/analytics?from=${f}&to=${t}`);

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
      await fetch(`${apiBase}/api/v1/cash-entries/${id}`, { method: "DELETE", credentials: "include" });
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

  return (
    <div className="flex flex-col gap-6">
      {/* Date range */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Dari</label>
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Sampai</label>
          <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="h-9 w-40" />
        </div>
        <Button size="sm" onClick={applyRange}>Terapkan</Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pendapatan" value={formatRupiah(ov?.revenue_cents ?? 0)} />
        <Stat
          label="Laba Kotor"
          value={formatRupiah(ov?.gross_profit_cents ?? 0)}
          trend={{ direction: (ov?.gross_profit_cents ?? 0) >= 0 ? "up" : "down", label: `${(ov?.margin_pct ?? 0).toFixed(1)}% margin` }}
        />
        <Stat
          label="Arus Kas Bersih"
          value={formatRupiah(ov?.net_cash_cents ?? 0)}
          trend={{ direction: (ov?.net_cash_cents ?? 0) >= 0 ? "up" : "down", label: `Masuk ${formatRupiah(ov?.cash_in_cents ?? 0)}` }}
        />
        <Stat label="Order" value={String(ov?.orders ?? 0)} trend={{ direction: "flat", label: `AOV ${formatRupiah(ov?.aov_cents ?? 0)}` }} />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        💡 Laba & HPP dihitung dari <strong>konsumsi bahan (resep)</strong> + biaya dropship. Produk tanpa resep belum punya angka HPP — pasang resep di produk biar akurat.
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

        {/* Payment mix */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Percent className="size-4 text-brand-600" aria-hidden />
            <h2 className="font-semibold text-neutral-900">Metode Pembayaran</h2>
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
                    <td className="py-2 text-neutral-900">{e.category || "—"}{e.note ? ` · ${e.note}` : ""}</td>
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
    </div>
  );
}
