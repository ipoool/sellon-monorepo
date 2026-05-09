import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PromoForm } from "@/components/dashboard/promo-form";
import { getMe } from "@/lib/server-auth";

export const metadata = { title: "Buat Promo — SellOn" };

export default async function PromoBaruPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  return (
    <DashboardShell
      me={me}
      pageTitle="Buat Promo"
      pageSubtitle="Bikin kupon diskon atau gratis ongkir"
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
        <PromoForm />
      </div>
    </DashboardShell>
  );
}
