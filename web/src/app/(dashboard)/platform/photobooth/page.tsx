import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminPhotoBoothManager } from "@/components/admin/admin-photobooth-manager";
import { Stat } from "@/components/ui/stat";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type {
  PhotoBoothBooth,
  PhotoBoothConfig,
  PhotoBoothFleetStats,
} from "@/lib/types";

export const metadata = { title: "Photo Booth" };

export default async function PlatformPhotoBoothPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const data = await serverApi<{
    booths: PhotoBoothBooth[];
    settings: PhotoBoothConfig;
    stats: PhotoBoothFleetStats;
  }>("/api/v1/admin/photobooth/booths");

  const booths = data?.booths ?? [];
  const settings = data?.settings ?? {
    price_cents: 0,
    shots_count: 4,
    print_copies: 1,
    session_timeout_seconds: 300,
    qris_expiry_minutes: 10,
    frames: [],
  };
  const stats = data?.stats ?? {
    active_booths: 0,
    offline_booths: 0,
    sessions_today: 0,
    gross_today_cents: 0,
  };

  return (
    <DashboardShell
      me={me}
      pageTitle="Photo Booth"
      pageSubtitle="Daftarkan booth, hubungkan tabletnya, dan atur harga"
    >
      {/* Offline count sits beside the active one on purpose: for an
          unattended fleet the useful question is not "how many exist" but
          "how many are silent right now". */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Booth aktif"
          value={stats.active_booths.toLocaleString("id-ID")}
        />
        <Stat
          label="Offline > 15 menit"
          value={stats.offline_booths.toLocaleString("id-ID")}
        />
        <Stat
          label="Sesi hari ini"
          value={stats.sessions_today.toLocaleString("id-ID")}
        />
        <Stat
          label="Omzet hari ini"
          value={formatRupiah(stats.gross_today_cents)}
        />
      </div>

      <AdminPhotoBoothManager booths={booths} settings={settings} />
    </DashboardShell>
  );
}
