import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getMe } from "@/lib/server-auth";
import { PengaturanTabs } from "@/components/dashboard/pengaturan-tabs";

export default async function PengaturanLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <DashboardShell
      me={me}
      pageTitle="Pengaturan"
      pageSubtitle="Kelola profil toko, pembayaran, pengiriman, dan WhatsApp"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="lg:sticky lg:top-[calc(var(--banners-h,0px)+4rem+1rem)] lg:w-56 lg:shrink-0 lg:rounded-xl lg:border lg:border-neutral-200 lg:bg-white lg:p-2 lg:shadow-card">
          <PengaturanTabs />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardShell>
  );
}
