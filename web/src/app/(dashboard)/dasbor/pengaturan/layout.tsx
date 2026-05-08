import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getMe } from "@/lib/server-auth";
import { PengaturanTabs } from "@/components/dashboard/pengaturan-tabs";

export default async function PengaturanLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/masuk");

  return (
    <DashboardShell
      me={me}
      pageTitle="Pengaturan"
      pageSubtitle="Kelola profil toko, pembayaran, pengiriman, dan WhatsApp"
    >
      <PengaturanTabs />
      <div className="mt-6">{children}</div>
    </DashboardShell>
  );
}
