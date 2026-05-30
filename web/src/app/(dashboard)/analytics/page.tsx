import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Download } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { AnalyticsAiButton } from "@/components/dashboard/analytics-ai-button";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type {
  AnalyticsOverview,
  CashEntry,
  ReportOverview,
  Subscription,
} from "@/lib/types";

export const metadata = { title: "Laporan & Analytics — SellOn" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function defaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromD = new Date(now);
  fromD.setDate(fromD.getDate() - 29);
  return { from: fromD.toISOString().slice(0, 10), to };
}

export default async function LaporanAnalyticsPage({
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

  // reports/overview is NOT plan-gated → powers the sales summary visible to
  // every tier. analytics/overview + cash-entries are BISNIS-only → serverApi
  // returns null on 402 (Free & Pro), and the financial section + AI render a
  // locked upsell for them.
  const [reportRes, ovRes, cashRes, subRes] = await Promise.all([
    serverApi<ReportOverview>(`/api/v1/reports/overview?${qs}`),
    serverApi<{ overview: AnalyticsOverview | null }>(
      `/api/v1/analytics/overview?${qs}`,
    ),
    serverApi<{ entries: CashEntry[] }>(`/api/v1/cash-entries?${qs}`),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);

  const report = reportRes ?? null;
  const overview = ovRes?.overview ?? null;
  const plan = subRes?.subscription?.plan;
  // Keuangan + Analisa AI are Bisnis-only; the sales summary stays open to all.
  const isBisnis = plan === "bisnis";

  return (
    <DashboardShell
      me={me}
      pageTitle="Laporan & Analytics"
      pageSubtitle="Penjualan, pelanggan, keuangan, dan tren toko dalam satu halaman"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/reports/materials">
            <Button size="sm" variant="outline">
              <Boxes className="size-4" aria-hidden />
              <span className="hidden sm:inline">Laporan Bahan</span>
            </Button>
          </Link>
          <a
            href={`${apiBase}/api/v1/reports/export?${qs}`}
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline">
              <Download className="size-4" aria-hidden />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </a>
          <AnalyticsAiButton from={from} to={to} isPaid={isBisnis} />
        </div>
      }
    >
      <AnalyticsDashboard
        report={report}
        overview={overview}
        entries={cashRes?.entries ?? []}
        from={from}
        to={to}
        isPaid={isBisnis}
      />
    </DashboardShell>
  );
}
