import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  PackageOpen,
  Share2,
  Inbox,
  ShoppingBag,
  Copy,
  Eye,
  Lightbulb,
  ArrowRight,
  Settings,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type { DashboardStats, Store } from "@/lib/types";

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

  const [statsRes, storeRes] = await Promise.all([
    serverApi<DashboardStats>("/api/v1/dashboard/stats"),
    serverApi<{ store: Store | null }>("/api/v1/store"),
  ]);

  // First-time user: no store yet → push them through setup
  if (statsRes && !statsRes.has_store) {
    redirect("/dasbor/pengaturan/toko");
  }

  const stats = statsRes ?? {
    has_store: true,
    orders_today_count: 0,
    revenue_month_cents: 0,
    products_active: 0,
    products_low_stock: 0,
    customers_total: 0,
  };
  const store = storeRes?.store ?? null;

  const firstName = me.name.split(" ")[0] || "Juragan";
  const greeting = timeBasedGreeting();
  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const storeUrl = store ? `sellon.id/${store.slug}` : `sellon.id/${firstName.toLowerCase()}`;

  return (
    <DashboardShell
      me={me}
      pageTitle="Dasbor"
      pageSubtitle={today}
      actions={
        <Link href="/dasbor/produk/baru">
          <Button size="sm">
            <Plus className="size-4" aria-hidden />
            Tambah Produk
          </Button>
        </Link>
      }
    >
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Welcome card */}
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-card lg:col-span-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-neutral-500">{greeting},</p>
              <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                {firstName} 👋
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600">
                {stats.orders_today_count > 0 ? (
                  <>
                    Hari ini ada{" "}
                    <span className="font-medium text-neutral-900">
                      {stats.orders_today_count} pesanan
                    </span>
                    {stats.products_low_stock > 0 && (
                      <>
                        {" "}dan{" "}
                        <span className="font-medium text-neutral-900">
                          {stats.products_low_stock} produk
                        </span>{" "}
                        stok rendah
                      </>
                    )}
                    .
                  </>
                ) : (
                  <>
                    Toko-mu siap menerima pesanan. Bagikan link katalog
                    untuk dapat order pertama hari ini.
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dasbor/produk/baru">
                <Button size="sm" variant="outline">
                  <Plus className="size-4" aria-hidden />
                  Buat Produk
                </Button>
              </Link>
              <Link href="/dasbor/pesanan">
                <Button size="sm" variant="outline">
                  <PackageOpen className="size-4" aria-hidden />
                  Lihat Pesanan
                </Button>
              </Link>
              <Link href="/dasbor/pengaturan/pembayaran">
                <Button size="sm" variant="outline">
                  <Settings className="size-4" aria-hidden />
                  Pembayaran
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Share link card */}
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
                <span className="truncate">{storeUrl}</span>
              </div>
              <Button size="sm" aria-label="Salin link">
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600">
              <Eye className="size-3.5" aria-hidden />
              <span>Halaman publik akan live setelah katalog dirilis</span>
            </div>
          </div>
        </section>

        {/* Stats grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
          <Stat
            label="Pesanan Hari Ini"
            value={String(stats.orders_today_count)}
            trend={
              stats.orders_today_count > 0
                ? { direction: "up", label: "Hari ini" }
                : { direction: "flat", label: "Belum ada hari ini" }
            }
          />
          <Stat
            label="Pendapatan Bulan Ini"
            value={formatRupiah(stats.revenue_month_cents)}
            trend={
              stats.revenue_month_cents > 0
                ? { direction: "up", label: "Bulan berjalan" }
                : { direction: "flat", label: "Belum ada transaksi" }
            }
          />
          <Stat
            label="Produk Aktif"
            value={String(stats.products_active)}
            trend={
              stats.products_low_stock > 0
                ? { direction: "down", label: `${stats.products_low_stock} stok rendah` }
                : { direction: "flat", label: "Stok aman" }
            }
          />
          <Stat
            label="Pelanggan"
            value={String(stats.customers_total)}
            trend={{ direction: "flat", label: "Total tercatat" }}
          />
        </div>

        {/* Recent orders */}
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card lg:col-span-8">
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
            <div>
              <h3 className="font-semibold text-neutral-900">Pesanan Terbaru</h3>
              <p className="mt-0.5 text-sm text-neutral-500">
                {stats.orders_today_count > 0
                  ? `${stats.orders_today_count} pesanan hari ini`
                  : "Belum ada pesanan baru"}
              </p>
            </div>
            <Link href="/dasbor/pesanan">
              <Button size="sm" variant="ghost">
                Lihat semua
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </Link>
          </div>

          <div className="px-6 py-10">
            <EmptyState
              icon={Inbox}
              title="Belum ada pesanan"
              description="Bagikan link katalog ke WhatsApp grup pelanggan untuk mulai terima pesanan."
              ctaHref="/dasbor/produk"
              cta="Lihat Produk"
            />
          </div>
        </section>

        {/* Side column */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h3 className="font-semibold text-neutral-900">Produk Terlaris</h3>
              <p className="mt-0.5 text-xs text-neutral-500">7 hari terakhir</p>
            </div>
            <div className="px-5 py-8">
              {stats.products_active > 0 ? (
                <div className="text-center text-sm text-neutral-600">
                  <p>Data penjualan akan muncul setelah ada order pertama.</p>
                  <Link
                    href="/dasbor/produk"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600"
                  >
                    Kelola produk
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              ) : (
                <EmptyState
                  icon={ShoppingBag}
                  title="Tambah produk pertamamu"
                  description="Foto + nama + harga sudah cukup untuk mulai."
                  ctaHref="/dasbor/produk/baru"
                  cta="Buat Produk"
                  compact
                />
              )}
            </div>
          </section>

          <Card>
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
          </Card>
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
  ctaHref,
  compact,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
  cta: string;
  ctaHref: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-neutral-900">{title}</p>
        <p
          className={
            compact
              ? "mt-1 max-w-xs text-xs text-neutral-600"
              : "mt-1 max-w-xs text-sm text-neutral-600"
          }
        >
          {description}
        </p>
      </div>
      <Link href={ctaHref}>
        <Button size="sm" className="mt-1">
          {cta}
        </Button>
      </Link>
    </div>
  );
}
