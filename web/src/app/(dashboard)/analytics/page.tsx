import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, Zap } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { AnalyticsOverview, CashEntry } from "@/lib/types";

export const metadata = { title: "Analytics 360 — SellOn" };

function defaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromD = new Date(now);
  fromD.setDate(fromD.getDate() - 29);
  return { from: fromD.toISOString().slice(0, 10), to };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from || def.from;
  const to = sp.to || def.to;
  const qs = `from=${from}&to=${to}`;

  const [ovRes, cashRes] = await Promise.all([
    serverApi<{ overview: AnalyticsOverview | null }>(`/api/v1/analytics/overview?${qs}`),
    serverApi<{ entries: CashEntry[] }>(`/api/v1/cash-entries?${qs}`),
  ]);

  // serverApi returns null on 402 (free tier) — show the upsell.
  const overview = ovRes?.overview ?? null;
  const locked = !ovRes;

  return (
    <DashboardShell
      me={me}
      pageTitle="Analytics 360"
      pageSubtitle="Arus kas, keuntungan, dan tren penjualan tokomu"
    >
      {locked ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Lock className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Analytics 360 tersedia di Pro
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Lihat arus kas masuk/keluar, keuntungan kotor, margin, dan chart tren
            penjualan untuk ambil keputusan lebih cepat.
          </p>
          <Link href="/settings/subscription" className="mt-5 inline-block">
            <Button size="sm">
              <Zap className="size-4" aria-hidden />
              Upgrade ke Pro
            </Button>
          </Link>
        </Card>
      ) : (
        <AnalyticsDashboard
          overview={overview}
          entries={cashRes?.entries ?? []}
          from={from}
          to={to}
        />
      )}
    </DashboardShell>
  );
}
