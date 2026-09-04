import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Boxes } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MaterialMovementChart } from "@/components/dashboard/material-movement-chart";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, daysAgoWIB, todayWIB } from "@/lib/format";
import type { Material, MaterialMovement, MaterialMovementPoint } from "@/lib/types";

export const metadata = { title: "Riwayat Bahan — SellOn" };

const PAGE_SIZE = 30;

// WIB, not UTC — these run server-side in a UTC container, so before 07:00
// WIB a UTC "today" is the seller's yesterday.
function todayStr() {
  return todayWIB();
}
function thirtyDaysAgoStr() {
  return daysAgoWIB(29);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

// sumberLabel turns a movement into a human source description.
function sumberLabel(m: MaterialMovement): string {
  if (m.movement_type === "consume") {
    return m.order_number ? `Penjualan #${m.order_number}` : "Penjualan";
  }
  if (m.movement_type === "restock") {
    return m.note?.trim() || "Restock manual";
  }
  return m.note?.trim() || "Penyesuaian";
}

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const from = sp.from || thirtyDaysAgoStr();
  const to = sp.to || todayStr();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rangeParams = new URLSearchParams({ from, to });
  const listParams = new URLSearchParams({
    from,
    to,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });

  const [matRes, movesRes, seriesRes] = await Promise.all([
    serverApi<{ material: Material }>(`/api/v1/materials/${id}`),
    serverApi<{ movements: MaterialMovement[]; total: number }>(
      `/api/v1/materials/${id}/movements?${listParams}`,
    ),
    serverApi<{ series: MaterialMovementPoint[] }>(
      `/api/v1/materials/${id}/movement-series?${rangeParams}`,
    ),
  ]);

  const material = matRes?.material;
  if (!material) notFound();

  const movements = movesRes?.movements ?? [];
  const total = movesRes?.total ?? 0;
  const series = seriesRes?.series ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stockValue = Math.max(0, material.stock) * material.cost_cents;

  const pageHref = (p: number) => {
    const u = new URLSearchParams({ from, to });
    if (p > 1) u.set("page", String(p));
    const qs = u.toString();
    return `/materials/${id}?${qs}`;
  };

  return (
    <DashboardShell
      me={me}
      pageTitle={material.name}
      pageSubtitle={`Riwayat stok masuk & keluar · ${from} → ${to}`}
    >
      <div className="mb-4">
        <Link
          href="/materials"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke Bahan Baku
        </Link>
      </div>

      {/* Header stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Stok Sekarang"
          value={`${material.stock.toLocaleString("id-ID")} ${material.base_unit}`}
        />
        <Stat label="Nilai Stok" value={formatRupiah(stockValue)} />
        <Stat
          label="Status"
          value={material.low_stock ? "Stok menipis" : "Aman"}
        />
      </div>

      {/* Date filter */}
      <form
        method="GET"
        className="mb-6 mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
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

      {/* Chart */}
      <MaterialMovementChart series={series} baseUnit={material.base_unit} />

      {/* History table */}
      <Card className="mt-6">
        <h2 className="mb-4 font-semibold text-neutral-900">Riwayat Keluar / Masuk</h2>
        {movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Boxes className="size-8 text-neutral-400" aria-hidden />
            <p className="font-semibold text-neutral-900">Belum ada pergerakan stok</p>
            <p className="text-sm text-neutral-500">
              Stok keluar tercatat otomatis saat produk ber-resep terjual; stok
              masuk dari restock / pembelian / opname.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-100 text-neutral-500">
                  <tr>
                    <th className="py-2 text-left font-medium">Tanggal</th>
                    <th className="py-2 text-left font-medium">Jenis</th>
                    <th className="py-2 text-right font-medium">Jumlah</th>
                    <th className="py-2 text-left font-medium">Sumber</th>
                    <th className="py-2 text-right font-medium">Modal/satuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {movements.map((m) => {
                    const isIn = m.quantity > 0;
                    return (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap py-2.5 text-neutral-500">
                          {formatDateTime(m.created_at)}
                        </td>
                        <td className="py-2.5">
                          <Badge variant={isIn ? "success" : "danger"}>
                            {isIn ? "Masuk" : "Keluar"}
                          </Badge>
                        </td>
                        <td
                          className={`py-2.5 text-right font-medium tabular-nums ${isIn ? "text-success" : "text-danger"}`}
                        >
                          {isIn ? "+" : ""}
                          {m.quantity.toLocaleString("id-ID")} {material.base_unit}
                        </td>
                        <td className="py-2.5 text-neutral-700">{sumberLabel(m)}</td>
                        <td className="py-2.5 text-right tabular-nums text-neutral-500">
                          {formatRupiah(m.unit_cost_cents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-neutral-500">
                  Halaman {page} dari {totalPages} · {total} entri
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link
                      href={pageHref(page - 1)}
                      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Sebelumnya
                    </Link>
                  ) : (
                    <span className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-300">
                      Sebelumnya
                    </span>
                  )}
                  {page < totalPages ? (
                    <Link
                      href={pageHref(page + 1)}
                      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Berikutnya
                    </Link>
                  ) : (
                    <span className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-300">
                      Berikutnya
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </DashboardShell>
  );
}
