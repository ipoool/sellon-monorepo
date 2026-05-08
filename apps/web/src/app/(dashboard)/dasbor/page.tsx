import { redirect } from "next/navigation";
import {
  Plus,
  PackageOpen,
  Share2,
  ArrowDownToLine,
  Inbox,
  ShoppingBag,
  Copy,
  Eye,
  Lightbulb,
  ArrowRight,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";

const stats = [
  {
    label: "Pesanan Hari Ini",
    value: "12",
    trend: { direction: "up" as const, label: "+25% vs kemarin" },
    sparkline: [3, 4, 2, 5, 7, 6, 8, 9, 10, 12],
  },
  {
    label: "Pendapatan Bulan Ini",
    value: "Rp 4,8jt",
    trend: { direction: "up" as const, label: "+12% vs bulan lalu" },
    sparkline: [2, 3, 3, 4, 5, 5, 6, 7, 7, 8],
  },
  {
    label: "Produk Aktif",
    value: "37",
    trend: { direction: "flat" as const, label: "2 stok rendah" },
    sparkline: [35, 36, 37, 36, 37, 37, 37, 37, 37, 37],
  },
  {
    label: "Pelanggan Baru",
    value: "8",
    trend: { direction: "up" as const, label: "+3 minggu ini" },
    sparkline: [1, 2, 1, 3, 2, 4, 3, 5, 6, 8],
  },
];

const quickActions = [
  { icon: Plus, label: "Buat Produk" },
  { icon: PackageOpen, label: "Lihat Pesanan" },
  { icon: ArrowDownToLine, label: "Tarik Saldo" },
];

function timeBasedGreeting() {
  const hour = (new Date().getUTCHours() + 7) % 24;
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

export default async function DasborPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  const firstName = me.name.split(" ")[0] || "Juragan";
  const greeting = timeBasedGreeting();
  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <DashboardShell
      me={me}
      pageTitle="Dasbor"
      pageSubtitle={today}
      actions={
        <Button size="sm">
          <Plus className="size-4" aria-hidden />
          Tambah Produk
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Welcome card — left wide */}
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-card lg:col-span-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-neutral-500">{greeting},</p>
              <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                {firstName} 👋
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600">
                Hari ini ada{" "}
                <span className="font-medium text-neutral-900">
                  3 pesanan baru
                </span>{" "}
                yang menunggu konfirmasi dan{" "}
                <span className="font-medium text-neutral-900">
                  2 produk
                </span>{" "}
                stok rendah.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map(({ icon: Icon, label }) => (
                <Button key={label} size="sm" variant="outline">
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* Share link card — right narrow */}
        <section className="relative overflow-hidden rounded-xl border border-brand-200 bg-gradient-brand-soft p-6 shadow-card lg:col-span-4">
          <div
            aria-hidden
            className="bg-dot-grid pointer-events-none absolute inset-0 opacity-40"
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <Share2 className="size-4 text-brand-700" aria-hidden />
              <p className="text-sm font-semibold text-brand-700">
                Bagikan toko-mu
              </p>
            </div>
            <p className="mt-2 text-xs text-neutral-700">
              Salin link katalog dan kirim ke grup WhatsApp pelanggan-mu.
            </p>

            <div className="mt-4 flex items-stretch gap-2">
              <div className="flex flex-1 items-center rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700">
                <span className="truncate">sellon.id/{firstName.toLowerCase()}</span>
              </div>
              <Button size="sm" aria-label="Salin link">
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600">
              <Eye className="size-3.5" aria-hidden />
              <span>
                <span className="font-medium text-neutral-900">12</span>{" "}
                kunjungan hari ini
              </span>
            </div>
          </div>
        </section>

        {/* Stats grid — full width */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
          {stats.map((s) => (
            <Stat
              key={s.label}
              label={s.label}
              value={s.value}
              trend={s.trend}
              sparkline={s.sparkline}
            />
          ))}
        </div>

        {/* Recent orders — left wide */}
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card lg:col-span-8">
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
            <div>
              <h3 className="font-semibold text-neutral-900">Pesanan Terbaru</h3>
              <p className="mt-0.5 text-sm text-neutral-500">
                3 pesanan menunggu konfirmasi
              </p>
            </div>
            <Button size="sm" variant="ghost">
              Lihat semua
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </div>

          <div className="px-6 py-10">
            <EmptyState
              icon={Inbox}
              title="Belum ada pesanan"
              description="Bagikan link katalog ke WhatsApp grup pelanggan untuk mulai terima pesanan."
              cta="Salin Link Katalog"
            />
          </div>
        </section>

        {/* Side column: Top products + Daily tip */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-neutral-900">
                  Produk Terlaris
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500">7 hari terakhir</p>
              </div>
            </div>

            <div className="px-5 py-8">
              <EmptyState
                icon={ShoppingBag}
                title="Tambah produk pertamamu"
                description="Foto produk + harga sudah cukup untuk mulai."
                cta="Buat Produk Baru"
                compact
              />
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-warning/15 text-neutral-800">
                <Lightbulb className="size-4" aria-hidden />
              </div>
              <Badge variant="warning">Tips Hari Ini</Badge>
            </div>
            <h3 className="mt-4 font-semibold text-neutral-900">
              Foto produk pakai cahaya pagi
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Cahaya alami jam 8–10 pagi bikin produk-mu terlihat fresh dan
              warnanya akurat. Hindari flash HP — bikin shadow keras.
            </p>
            <a
              href="/panduan"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Baca panduan lengkap
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  compact,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
  cta: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-neutral-900">{title}</p>
        <p className={compact ? "mt-1 max-w-xs text-xs text-neutral-600" : "mt-1 max-w-xs text-sm text-neutral-600"}>
          {description}
        </p>
      </div>
      <Button size="sm" className="mt-1">
        {cta}
      </Button>
    </div>
  );
}
