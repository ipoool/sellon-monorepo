import { redirect } from "next/navigation";
import { Users, Download } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomersTable } from "@/components/dashboard/customers-table";
import { SegmentSettingsButton } from "@/components/dashboard/segment-settings-card";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Customer, Store } from "@/lib/types";

export const metadata = { title: "Pelanggan - SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default async function PelangganPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const [data, storeData] = await Promise.all([
    serverApi<{ customers: Customer[] }>("/api/v1/customers"),
    serverApi<{ store: Store | null }>("/api/v1/store"),
  ]);
  const customers = data?.customers ?? [];
  const store = storeData?.store;

  return (
    <DashboardShell
      me={me}
      pageTitle="Pelanggan"
      pageSubtitle={`${customers.length} pelanggan`}
      actions={
        <div className="flex items-center gap-2">
          <SegmentSettingsButton
            initialVip={store?.segment_vip_threshold ?? 10}
            initialLoyal={store?.segment_loyal_threshold ?? 3}
            initialBaruName={store?.segment_baru_name ?? "Baru"}
            initialRegulerName={store?.segment_reguler_name ?? "Reguler"}
            initialLoyalName={store?.segment_loyal_name ?? "Loyal"}
            initialVipName={store?.segment_vip_name ?? "VIP"}
          />
          {customers.length > 0 && (
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
          )}
        </div>
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
            masuk. Datamu, dataku - ekspor kapan saja ke CSV tanpa biaya
            tambahan.
          </p>
          <p className="mt-4 text-xs text-neutral-500">
            ⭐ Salah satu alasan banyak seller pindah dari marketplace.
          </p>
        </Card>
      ) : (
        <CustomersTable customers={customers} />
      )}
    </DashboardShell>
  );
}
