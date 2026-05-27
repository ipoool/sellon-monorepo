import { redirect } from "next/navigation";
import { Truck } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { DropshipOrdersTable } from "@/components/dashboard/dropship-orders-table";
import type { DropshipOrderItem } from "@/lib/types";

export const metadata = { title: "Order Dropship — SellOn" };

export default async function SupplierOrdersPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const res = await serverApi<{ orders: DropshipOrderItem[] }>("/api/v1/reseller/supplier/orders");
  const orders = res?.orders ?? [];

  const pending = orders.filter((o) => !o.shipped_at).length;
  const shipped = orders.filter((o) => o.shipped_at).length;

  return (
    <DashboardShell
      me={me}
      pageTitle="Order Dropship"
      pageSubtitle={`${pending} perlu dikirim · ${shipped} sudah dikirim`}
    >
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Truck className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Belum ada order dropship</p>
            <p className="mt-1 text-sm text-neutral-500">
              Order akan muncul di sini ketika reseller menerima pembeli untuk produk-produk kamu.
            </p>
          </div>
        </div>
      ) : (
        <DropshipOrdersTable orders={orders} />
      )}
    </DashboardShell>
  );
}
