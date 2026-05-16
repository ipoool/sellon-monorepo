"use client";

import { Badge } from "@/components/ui/badge";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/dashboard/table-pagination";
import { PromoEditButton } from "@/components/dashboard/promo-dialog";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { Promo, PromoType } from "@/lib/types";

const typeLabel: Record<PromoType, string> = {
  percent: "Persentase",
  fixed: "Nominal",
  free_shipping: "Gratis Ongkir",
};

function formatPromoValue(p: Promo): string {
  if (p.type === "percent") return `${p.value}%`;
  if (p.type === "fixed") return formatRupiah(p.value);
  return "—";
}

function statusBadge(p: Promo): {
  label: string;
  variant: "default" | "success" | "warning";
} {
  const now = Date.now();
  if (!p.is_active) return { label: "Nonaktif", variant: "default" };
  if (p.expires_at && new Date(p.expires_at).getTime() < now)
    return { label: "Kadaluarsa", variant: "warning" };
  if (p.starts_at && new Date(p.starts_at).getTime() > now)
    return { label: "Belum Mulai", variant: "default" };
  if (p.max_usage > 0 && p.used_count >= p.max_usage)
    return { label: "Habis", variant: "warning" };
  return { label: "Aktif", variant: "success" };
}

type Props = {
  promos: Promo[];
  page: number;
  total: number;
};

export function PromosTable({ promos, page, total }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* ── Mobile: card list ── */}
      <div className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-card md:hidden">
        {promos.map((p) => {
          const s = statusBadge(p);
          return (
            <div key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold uppercase tracking-wide text-neutral-900">
                    {p.code}
                  </span>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-700">
                  {typeLabel[p.type]}
                  {p.type !== "free_shipping" && ` · ${formatPromoValue(p)}`}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                  <span>Dipakai: {p.used_count}{p.max_usage > 0 ? ` / ${p.max_usage}` : ""}</span>
                  {p.min_purchase_cents > 0 && (
                    <span>Min: {formatRupiah(p.min_purchase_cents)}</span>
                  )}
                  <span>
                    {p.starts_at ? formatDateID(p.starts_at) : "—"}
                    {" → "}
                    {p.expires_at ? formatDateID(p.expires_at) : "Tanpa batas"}
                  </span>
                </div>
              </div>
              <PromoEditButton promo={p} />
            </div>
          );
        })}
      </div>

      {/* ── Desktop: full table ── */}
      <div className="hidden overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-5 py-3">Kode</th>
              <th className="px-5 py-3">Tipe</th>
              <th className="px-5 py-3">Nilai</th>
              <th className="px-5 py-3">Min Belanja</th>
              <th className="px-5 py-3">Pemakaian</th>
              <th className="px-5 py-3">Berlaku</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {promos.map((p) => {
              const s = statusBadge(p);
              return (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3">
                    <span className="font-mono text-sm font-semibold uppercase tracking-wide text-neutral-900">
                      {p.code}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{typeLabel[p.type]}</td>
                  <td className="px-5 py-3 font-medium text-neutral-900">{formatPromoValue(p)}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {p.min_purchase_cents > 0 ? formatRupiah(p.min_purchase_cents) : "—"}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {p.used_count}{p.max_usage > 0 ? ` / ${p.max_usage}` : ""}
                  </td>
                  <td className="px-5 py-3 text-xs text-neutral-600">
                    {p.starts_at ? formatDateID(p.starts_at) : "—"}
                    {" → "}
                    {p.expires_at ? formatDateID(p.expires_at) : "Tanpa batas"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <PromoEditButton promo={p} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={page}
        pageSize={TABLE_PAGE_SIZE}
        total={total}
        paramName="page"
      />
    </div>
  );
}
