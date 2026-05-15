import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/dashboard/table-pagination";
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
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {promos.map((p) => {
              const s = statusBadge(p);
              return (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/promos/${p.id}`}
                      className="font-mono text-sm font-semibold uppercase tracking-wide text-neutral-900 hover:text-brand-700"
                    >
                      {p.code}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {typeLabel[p.type]}
                  </td>
                  <td className="px-5 py-3 font-medium text-neutral-900">
                    {formatPromoValue(p)}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {p.min_purchase_cents > 0
                      ? formatRupiah(p.min_purchase_cents)
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {p.used_count}
                    {p.max_usage > 0 ? ` / ${p.max_usage}` : ""}
                  </td>
                  <td className="px-5 py-3 text-xs text-neutral-600">
                    {p.starts_at ? formatDateID(p.starts_at) : "—"}
                    {" → "}
                    {p.expires_at ? formatDateID(p.expires_at) : "∞"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={s.variant}>{s.label}</Badge>
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
