import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Download, Receipt } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { AnalyticsAiButton } from "@/components/dashboard/analytics-ai-button";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { daysAgoWIB, todayWIB } from "@/lib/format";
import type {
  AnalyticsOverview,
  CashEntry,
  ReportOverview,
  Store,
  Subscription,
} from "@/lib/types";

export const metadata = { title: "Laporan & Analytics" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function defaultRange() {
  // WIB, not UTC: this runs server-side in a UTC container, so before 07:00
  // WIB a UTC "today" is yesterday for the seller.
  return { from: daysAgoWIB(29), to: todayWIB() };
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
  const [reportRes, ovRes, cashRes, subRes, storeRes] = await Promise.all([
    serverApi<ReportOverview>(`/api/v1/reports/overview?${qs}`),
    serverApi<{ overview: AnalyticsOverview | null }>(
      `/api/v1/analytics/overview?${qs}`,
    ),
    serverApi<{ entries: CashEntry[] }>(`/api/v1/cash-entries?${qs}`),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
    serverApi<{ store: Store | null }>("/api/v1/store"),
  ]);

  const report = reportRes ?? null;
  const overview = ovRes?.overview ?? null;
  // Keuangan + Analisa AI sit in the Analisa AI add-on; the sales summary
  // stays open to all. Gate on the entitlement rather than the tier, so a
  // Pro store that activated the package gets what it pays for.
  const hasAI = (subRes?.subscription?.features ?? []).includes("ai_analytics");
  // The tax report only exists for a store that charges tax. Showing the
  // button otherwise hands the seller an empty file and a question.
  const taxOn = !!storeRes?.store?.tax_enabled;
  const taxLabel = storeRes?.store?.tax_label || "PPN";

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
          {taxOn && (
            <a
              href={`${apiBase}/api/v1/reports/tax?${qs}`}
              download
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="outline">
                <Receipt className="size-4" aria-hidden />
                <span className="hidden sm:inline">Laporan {taxLabel}</span>
              </Button>
            </a>
          )}
          <AnalyticsAiButton from={from} to={to} isPaid={hasAI} />
        </div>
      }
    >
      <AnalyticsDashboard
        report={report}
        overview={overview}
        entries={cashRes?.entries ?? []}
        from={from}
        to={to}
        isPaid={hasAI}
      />
    </DashboardShell>
  );
}
