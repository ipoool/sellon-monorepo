import { redirect } from "next/navigation";
import Link from "next/link";
import { Megaphone } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromoCreateDialog } from "@/components/dashboard/promo-create-dialog";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { Promo, PromoType } from "@/lib/types";

export const metadata = { title: "Promo — SellOn" };

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

export default async function PromoPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  const data = await serverApi<{ promos: Promo[] }>("/api/v1/promos");
  const promos = data?.promos ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Promo"
      pageSubtitle={`${promos.length} kupon`}
      actions={<PromoCreateDialog />}
    >
      {promos.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Megaphone className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada promo
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Bikin kupon diskon, gratis ongkir, atau potongan nominal untuk
            menarik pelanggan dan boost konversi.
          </p>
          <div className="mt-5 inline-block">
            <PromoCreateDialog />
          </div>
        </Card>
      ) : (
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
                        href={`/dasbor/promo/${p.id}`}
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
      )}
    </DashboardShell>
  );
}
