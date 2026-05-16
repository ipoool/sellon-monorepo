import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { PromoDialog } from "@/components/dashboard/promo-dialog";
import { PromosTable } from "@/components/dashboard/promos-table";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Promo } from "@/lib/types";

export const metadata = { title: "Promo — SellOn" };

const PAGE_SIZE = 25;

export default async function PromoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { page: pageParam = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((page - 1) * PAGE_SIZE));

  const data = await serverApi<{ promos: Promo[]; total: number }>(
    `/api/v1/promos?${params.toString()}`,
  );
  const promos = data?.promos ?? [];
  const total = data?.total ?? promos.length;

  return (
    <DashboardShell
      me={me}
      pageTitle="Promo"
      pageSubtitle={`${total} kupon`}
      actions={<PromoDialog mode="create" />}
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
            <PromoDialog mode="create" />
          </div>
        </Card>
      ) : (
        <PromosTable promos={promos} page={page} total={total} />
      )}
    </DashboardShell>
  );
}
