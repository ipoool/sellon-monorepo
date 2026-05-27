import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Zap } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { ResellerProgramList } from "@/components/dashboard/reseller-program-list";
import { CreateProgramDialog } from "@/components/dashboard/create-program-dialog";
import type { ResellerProgram, Subscription } from "@/lib/types";

export const metadata = { title: "Program Reseller Supplier — SellOn" };

export default async function ResellerProgramPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const [res, subRes] = await Promise.all([
    serverApi<{ programs: ResellerProgram[] }>("/api/v1/reseller/programs"),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);

  const programs = res?.programs ?? [];
  const plan = subRes?.subscription?.plan ?? "free";
  const isFree = plan === "free";

  return (
    <DashboardShell
      me={me}
      pageTitle="Program Reseller Saya"
      pageSubtitle="Kelola program, produk, dan undang reseller"
      actions={<CreateProgramDialog disabled={isFree} />}
    >
      {isFree ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Zap className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Fitur untuk plan Pro & Bisnis</p>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Buat program reseller, undang dropshipper, dan jual produk kamu lewat jaringan reseller.
              Upgrade untuk mengaktifkan fitur ini.
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <Zap className="size-4" aria-hidden />
            Upgrade ke Pro
          </Link>
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Users className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Belum ada program reseller</p>
            <p className="mt-1 text-sm text-neutral-500">
              Buat program, pilih produk + harga modal, dan bagikan kode undangan ke calon reseller.
            </p>
          </div>
          <CreateProgramDialog />
        </div>
      ) : (
        <ResellerProgramList programs={programs} />
      )}
    </DashboardShell>
  );
}
