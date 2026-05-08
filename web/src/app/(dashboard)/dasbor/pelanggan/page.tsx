import { redirect } from "next/navigation";
import { Users, Download } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { Customer } from "@/lib/types";

export const metadata = { title: "Pelanggan — SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default async function PelangganPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  const data = await serverApi<{ customers: Customer[] }>("/api/v1/customers");
  const customers = data?.customers ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Pelanggan"
      pageSubtitle={`${customers.length} pelanggan`}
      actions={
        customers.length > 0 ? (
          <a
            href={`${apiBase}/api/v1/customers/export`}
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline">
              <Download className="size-4" aria-hidden />
              Export CSV
            </Button>
          </a>
        ) : undefined
      }
    >
      {customers.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Users className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada pelanggan
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Database pelanggan otomatis terisi setiap kali ada order baru
            masuk. Datamu, dataku — ekspor kapan saja ke CSV tanpa biaya
            tambahan.
          </p>
          <p className="mt-4 text-xs text-neutral-500">
            ⭐ Salah satu alasan banyak seller pindah dari marketplace.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3">Nama</th>
                <th className="px-5 py-3">WhatsApp</th>
                <th className="px-5 py-3">Kota</th>
                <th className="px-5 py-3">Total Order</th>
                <th className="px-5 py-3">Total Belanja</th>
                <th className="px-5 py-3">Terakhir Belanja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size="sm" />
                      <p className="font-medium text-neutral-900">{c.name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-neutral-700">
                    {c.whatsapp_number}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{c.city}</td>
                  <td className="px-5 py-3 text-neutral-700">{c.total_orders}</td>
                  <td className="px-5 py-3 font-medium text-neutral-900">
                    {formatRupiah(c.total_spent_cents)}
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {c.last_order_at ? formatDateID(c.last_order_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
