import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Calendar, Download, Lock, Zap } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type { Subscription } from "@/lib/types";

export const metadata = { title: "Laporan Bahan — SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type MaterialReport = {
  total_cost_cents: number;
  by_material: {
    material_id: string;
    name: string;
    base_unit: string;
    kind: "ingredient" | "packaging" | string;
    qty: number;
    cost_cents: number;
  }[];
  daily_series: { date: string; cost_cents: number }[];
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

const kindLabel: Record<string, string> = {
  ingredient: "Bahan",
  packaging: "Packaging",
};

export default async function MaterialReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const from = sp.from || thirtyDaysAgoStr();
  const to = sp.to || todayStr();
  const params = new URLSearchParams({ from, to });

  const [reportRes, subRes] = await Promise.all([
    serverApi<{ report: MaterialReport }>(`/api/v1/materials/report?${params}`),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);
  const plan = subRes?.subscription?.plan ?? "free";
  const locked = plan !== "pro" && plan !== "bisnis";
  const report = reportRes?.report;

  return (
    <DashboardShell
      me={me}
      pageTitle="Laporan Konsumsi Bahan"
      pageSubtitle={`Dari ${from} sampai ${to}`}
      actions={
        !locked && report && report.by_material.length > 0 ? (
          <a
            href={`${apiBase}/api/v1/materials/report.csv?${params}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        ) : undefined
      }
    >
      {locked ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Lock className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Laporan konsumsi bahan tersedia di Pro
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Lihat berapa banyak tiap bahan & packaging terpakai per periode plus
            total biayanya — biar gampang rencanakan belanja bulan depan.
          </p>
          <Link href="/settings/subscription" className="mt-5 inline-block">
            <Button size="sm">
              <Zap className="size-4" aria-hidden />
              Upgrade ke Pro
            </Button>
          </Link>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <form
            method="GET"
            className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500">Dari tanggal</label>
              <Input type="date" name="from" defaultValue={from} className="h-9 w-40" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500">Sampai</label>
              <Input type="date" name="to" defaultValue={to} className="h-9 w-40" />
            </div>
            <Button type="submit" size="sm">
              <Calendar className="size-4" aria-hidden />
              Terapkan
            </Button>
          </form>

          {!report || report.by_material.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
              <Boxes className="size-8 text-neutral-400" aria-hidden />
              <p className="font-semibold text-neutral-900">
                Belum ada konsumsi bahan di periode ini
              </p>
              <p className="text-sm text-neutral-500">
                Konsumsi tercatat otomatis tiap produk ber-resep terjual. Ubah
                rentang tanggal atau pasang resep di produk.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Total Biaya Bahan"
                  value={formatRupiah(report.total_cost_cents)}
                />
                <Stat
                  label="Jenis Bahan Terpakai"
                  value={String(report.by_material.length)}
                />
                <Stat label="Bahan Teratas" value={report.by_material[0]?.name ?? "—"} />
              </div>

              <Card className="mt-6">
                <h2 className="mb-4 font-semibold text-neutral-900">
                  Konsumsi per Bahan
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-neutral-100 text-neutral-500">
                      <tr>
                        <th className="py-2 text-left font-medium">Bahan</th>
                        <th className="py-2 text-left font-medium">Jenis</th>
                        <th className="py-2 text-right font-medium">Terpakai</th>
                        <th className="py-2 text-right font-medium">Total Biaya</th>
                        <th className="py-2 text-right font-medium">Kontribusi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {report.by_material.map((m) => {
                        const pct =
                          report.total_cost_cents > 0
                            ? Math.round((m.cost_cents / report.total_cost_cents) * 100)
                            : 0;
                        return (
                          <tr key={m.material_id}>
                            <td className="py-2.5 font-medium text-neutral-900">{m.name}</td>
                            <td className="py-2.5">
                              <Badge variant="outline">
                                {kindLabel[m.kind] ?? m.kind}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-neutral-700">
                              {m.qty.toLocaleString("id-ID")} {m.base_unit}
                            </td>
                            <td className="py-2.5 text-right font-medium tabular-nums text-neutral-900">
                              {formatRupiah(m.cost_cents)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-neutral-500">
                              {pct}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </DashboardShell>
  );
}
