"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MaterialMovementPoint } from "@/lib/types";

function compactRp(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return String(v);
}

type Mode = "qty" | "rupiah";

// MaterialMovementChart shows Masuk vs Keluar per WIB day, toggleable between
// quantity (in base_unit) and Rupiah (modal value).
export function MaterialMovementChart({
  series,
  baseUnit,
}: {
  series: MaterialMovementPoint[];
  baseUnit: string;
}) {
  const [mode, setMode] = useState<Mode>("qty");

  const data = series.map((p) => ({
    date: p.date.slice(5), // MM-DD
    masuk: mode === "qty" ? p.in_qty : p.in_cost_cents / 100,
    keluar: mode === "qty" ? p.out_qty : p.out_cost_cents / 100,
  }));

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Masuk vs Keluar per Tanggal</h2>
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 p-0.5">
          {(["qty", "rupiah"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                mode === m ? "bg-brand-50 text-brand-700" : "text-neutral-500 hover:text-neutral-800",
              )}
            >
              {m === "qty" ? "Jumlah" : "Rupiah"}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">
          Belum ada pergerakan stok di periode ini.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                width={48}
                tickFormatter={(v) => (mode === "qty" ? String(v) : compactRp(Number(v) * 100))}
              />
              <Tooltip
                formatter={(v) =>
                  mode === "qty" ? `${Number(v).toLocaleString("id-ID")} ${baseUnit}` : formatRupiah(Number(v) * 100)
                }
              />
              <Legend />
              <Bar dataKey="masuk" name="Masuk" fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="keluar" name="Keluar" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
