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
  Crown,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { BannerSlider } from "@/components/dashboard/banner-slider";
import { Button } from "@/components/ui/button";
import { CopyUrlButton } from "@/components/dashboard/copy-url-button";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah, formatDateTimeID } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DashboardStats,
  Order,
  PlatformBanner,
  Store,
  Subscription,
} from "@/lib/types";

const statusBadge: Record<
  Order["status"],
  { variant: "success" | "default" | "warning" | "brand"; label: string }
> = {
  pending: { variant: "warning", label: "Menunggu" },
  confirmed: { variant: "brand", label: "Dikonfirmasi" },
  processing: { variant: "brand", label: "Diproses" },
  shipped: { variant: "brand", label: "Dikirim" },
  completed: { variant: "success", label: "Selesai" },
  cancelled: { variant: "default", label: "Dibatalkan" },
};

const paymentBadge: Record<
  Order["payment_status"],
  { variant: "success" | "default" | "warning"; label: string }
> = {
  unpaid: { variant: "default", label: "Belum bayar" },
  pending: { variant: "warning", label: "Menunggu" },
  paid: { variant: "success", label: "Lunas" },
  failed: { variant: "default", label: "Gagal" },
  refunded: { variant: "default", label: "Refund" },
};

function timeBasedGreeting() {
  const hour = (new Date().getUTCHours() + 7) % 24;
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

// Tip rotates daily — same tip for all sellers on the same date so it
// feels like a fresh thought every morning rather than randomly different
// every refresh. Index derived from day-of-year (WIB) modulo length.
const dailyTips: { title: string; body: string }[] = [
  {
    title: "Foto produk pakai cahaya pagi",
    body: "Cahaya alami jam 8-10 pagi bikin produk-mu terlihat fresh dan warnanya akurat. Hindari flash HP - bikin shadow keras.",
  },
  {
    title: "Balas chat WhatsApp dalam 15 menit",
    body: "Konversi chat → order paling tinggi kalau dibalas cepat. Pakai template balasan untuk pertanyaan yang sering diulang.",
  },
  {
    title: "Tulis deskripsi produk seperti ngobrol",
    body: "Pembeli mau tahu manfaat, bukan spesifikasi teknis. Tulis 'kulit jadi lembut sepanjang hari', bukan 'mengandung 5% niacinamide'.",
  },
  {
    title: "Bagikan link katalog ke status WA",
    body: "Status WhatsApp dilihat orang yang udah kenal kamu - konversinya jauh lebih tinggi daripada iklan dingin.",
  },
  {
    title: "Set stok rendah biar tidak oversell",
    body: "Aktifkan 'Stok rendah threshold' di setiap produk. Saat stok mendekati batas, tampil badge kuning di dasbor.",
  },
  {
    title: "Promo gratis ongkir > diskon nominal",
    body: "Riset menunjukkan 'Gratis Ongkir' lebih tinggi konversinya daripada potongan harga sama nilainya. Pakai itu di kupon-mu.",
  },
  {
    title: "Foto pertama paling penting",
    body: "Di hasil pencarian katalog, pembeli cuma lihat foto pertama. Pakai foto produk paling jelas dan bagus, bukan logo brand.",
  },
  {
    title: "Cek mutasi rekening tiap pagi",
    body: "Buat habit cek mutasi sekali pagi, sekali sore. Konfirmasi pembayaran manual di SellOn supaya stok dan status order match.",
  },
  {
    title: "Pelanggan repeat = uang yang sama dengan ½ effort",
    body: "Liat menu Pelanggan - filter 'Loyal' dan 'VIP'. Sapa mereka pas ada produk baru, mereka kemungkinan besar order lagi.",
  },
  {
    title: "Update jam buka di Profil Toko",
    body: "Jam buka yang akurat = pembeli tahu kapan kamu balas. Toko keliatan lebih kredibel dibanding 'buka 24 jam' yang gak realistis.",
  },
];

function pickDailyTip(): { title: string; body: string } {
  // Day-of-year in WIB. Convert UTC → WIB, then count days from epoch.
  const wibMs = Date.now() + 7 * 60 * 60 * 1000;
  const dayIdx = Math.floor(wibMs / 86_400_000);
  return dailyTips[dayIdx % dailyTips.length];
}

export default async function DasborPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  // Platform admins land at /platform - the seller dasbor below
  // assumes a store exists (which admins don't have).
  if (me.role === "admin" && !me.is_impersonated) {
    redirect("/platform");
  }

  // (dashboard)/layout.tsx already guards: authed + has store.
  const [statsRes, storeRes, subRes, ordersRes, reportsRes, bannersRes] =
    await Promise.all([
      serverApi<DashboardStats>("/api/v1/dashboard/stats"),
      serverApi<{ store: Store | null }>("/api/v1/store"),
      serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
      serverApi<{ orders: Order[] }>("/api/v1/orders"),
      serverApi<{
        top_products: {
          product_id: string;
          product_name: string;
          qty_sold: number;
          revenue_cents: number;
        }[];
      }>("/api/v1/reports/overview?days=7"),
      serverApi<{ banners: PlatformBanner[] }>("/api/v1/banners"),
    ]);

  const stats = statsRes ?? {
    has_store: true,
    orders_today_count: 0,
    revenue_month_cents: 0,
    products_active: 0,
    products_low_stock: 0,
    customers_total: 0,
  };
  const store = storeRes?.store ?? null;
  const banners = bannersRes?.banners ?? [];
  const recentOrders = (ordersRes?.orders ?? []).slice(0, 5);
  const topProducts = (reportsRes?.top_products ?? []).slice(0, 5);
  const tipOfTheDay = pickDailyTip();

  // Surface order quota nudges only when (1) on a capped tier and (2) the
  // seller is at ≥80% usage. Keeps the dasbor calm for everyone else.
  const orderQuota = subRes?.subscription.quotas?.orders;
  const isOrderCapped = !!orderQuota && orderQuota.limit > 0;
  const orderQuotaFull = isOrderCapped && orderQuota.used >= orderQuota.limit;
  const orderQuotaWarn =
    isOrderCapped &&
    !orderQuotaFull &&
    orderQuota.used >= orderQuota.limit * 0.8;
  const showQuotaBanner = orderQuotaFull || orderQuotaWarn;
  const quotaUsedPct = isOrderCapped
    ? Math.min(100, (orderQuota.used / orderQuota.limit) * 100)
    : 0;

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
        <Link href="/products/new">
          <Button size="sm">
            <Plus className="size-4" aria-hidden />
            Tambah Produk
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {banners.length > 0 && (
          <div className="min-w-0 lg:col-span-12">
            <BannerSlider banners={banners} />
          </div>
        )}
        {showQuotaBanner && orderQuota && (
          <section
            className={cn(
              "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-12",
              orderQuotaFull
                ? "border-danger/40 bg-danger/5"
                : "border-warning/40 bg-warning/10",
            )}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-neutral-900">
                  {orderQuotaFull
                    ? "Limit pesanan bulan ini tercapai"
                    : "Pesanan bulan ini hampir penuh"}
                </p>
                <p className="text-xs font-medium text-neutral-700">
                  {orderQuota.used} / {orderQuota.limit}
                </p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    orderQuotaFull ? "bg-danger" : "bg-warning",
                  )}
                  style={{ width: `${quotaUsedPct}%` }}
                />
              </div>
              <p className="text-xs text-neutral-700">
                {orderQuotaFull
                  ? "Toko publikmu sementara menolak order baru. Upgrade Pro untuk pesanan tanpa batas."
                  : "Upgrade ke Pro sebelum limit kepenuhan biar pesanan tetap masuk."}
              </p>
            </div>
            <Link href="/settings/subscription" className="sm:shrink-0">
              <Button size="sm" variant={orderQuotaFull ? "default" : "outline"}>
                <Crown className="size-4" aria-hidden />
                Upgrade ke Pro
              </Button>
            </Link>
          </section>
        )}

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
              <Link href="/products/new">
                <Button size="sm" variant="outline">
                  <Plus className="size-4" aria-hidden />
                  Buat Produk
                </Button>
              </Link>
              <Link href="/orders">
                <Button size="sm" variant="outline">
                  <PackageOpen className="size-4" aria-hidden />
                  Lihat Pesanan
                </Button>
              </Link>
              <Link href="/settings/payment">
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
              <CopyUrlButton url={storeUrl} />
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
            <Link href="/orders">
              <Button size="sm" variant="ghost">
                Lihat semua
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState
                icon={Inbox}
                title="Belum ada pesanan"
                description="Bagikan link katalog ke WhatsApp grup pelanggan untuk mulai terima pesanan."
                ctaHref="/products"
                cta="Lihat Produk"
              />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders/${o.id}`}
                    className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-neutral-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-500">
                          {o.order_number}
                        </span>
                        <Badge variant={statusBadge[o.status].variant}>
                          {statusBadge[o.status].label}
                        </Badge>
                        <Badge variant={paymentBadge[o.payment_status].variant}>
                          {paymentBadge[o.payment_status].label}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-neutral-900">
                        {o.customer_name}
                        {o.customer_city && (
                          <span className="text-neutral-500">
                            {" · "}
                            {o.customer_city}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="font-display text-sm font-semibold text-neutral-900">
                        {formatRupiah(o.total_cents)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatDateTimeID(o.created_at)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Side column */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h3 className="font-semibold text-neutral-900">Produk Terlaris</h3>
              <p className="mt-0.5 text-xs text-neutral-500">7 hari terakhir</p>
            </div>
            {topProducts.length > 0 ? (
              <ul className="divide-y divide-neutral-100">
                {topProducts.map((p, idx) => (
                  <li
                    key={p.product_id || `${p.product_name}-${idx}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
                        {idx + 1}
                      </span>
                      {p.product_id ? (
                        <Link
                          href={`/products/${p.product_id}`}
                          className="truncate font-medium text-neutral-900 hover:text-brand-700"
                        >
                          {p.product_name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium text-neutral-900">
                          {p.product_name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-display text-sm font-semibold text-neutral-900">
                        {formatRupiah(p.revenue_cents)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {p.qty_sold} terjual
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 py-8">
                {stats.products_active > 0 ? (
                  <div className="text-center text-sm text-neutral-600">
                    <p>
                      Data penjualan akan muncul setelah ada order pertama.
                    </p>
                    <Link
                      href="/products"
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
                    ctaHref="/products/new"
                    cta="Buat Produk"
                    compact
                  />
                )}
              </div>
            )}
            {topProducts.length > 0 && (
              <div className="border-t border-neutral-100 px-5 py-3 text-right">
                <Link
                  href="/analytics"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Lihat laporan lengkap
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            )}
          </section>

          <Card>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-warning/15 text-neutral-800">
                <Lightbulb className="size-4" aria-hidden />
              </div>
              <Badge variant="warning">Tips Hari Ini</Badge>
            </div>
            <h3 className="mt-4 font-semibold text-neutral-900">
              {tipOfTheDay.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              {tipOfTheDay.body}
            </p>
            <Link
              href="/guides"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Baca panduan lengkap
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
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
