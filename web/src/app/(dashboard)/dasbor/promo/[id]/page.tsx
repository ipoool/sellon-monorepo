import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PromoForm } from "@/components/dashboard/promo-form";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Promo } from "@/lib/types";

export const metadata = { title: "Edit Promo — SellOn" };

export default async function PromoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/masuk");
  const { id } = await params;

  const data = await serverApi<{ promo: Promo }>(`/api/v1/promos/${id}`);
  if (!data) notFound();

  return (
    <DashboardShell
      me={me}
      pageTitle={`Edit ${data.promo.code}`}
      pageSubtitle={`Dipakai ${data.promo.used_count}× dari ${
        data.promo.max_usage > 0 ? data.promo.max_usage : "tanpa batas"
      }`}
      actions={
        <Link
          href="/dasbor/promo"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali
        </Link>
      }
    >
      <div className="max-w-2xl">
        <PromoForm initial={data.promo} />
      </div>
    </DashboardShell>
  );
}
