import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users,
  Store,
  Package,
  ShoppingBag,
  TrendingUp,
  CalendarDays,
  Crown,
  Ban,
  Tag,
  Receipt,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Stat } from "@/components/ui/stat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";

export const metadata = { title: "Ringkasan Platform — SellOn" };

type AdminStats = {
  total_users: number;
  banned_users: number;
  total_stores: number;
  open_stores: number;
  total_products: number;
  total_orders: number;
  orders_this_month: number;
  revenue_all_cents: number;
  revenue_month_cents: number;
  paid_subs_count: number;
};

export default async function PlatformOverviewPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const data = await serverApi<{ stats: AdminStats }>("/api/v1/admin/stats");
  const s = data?.stats ?? {
    total_users: 0,
    banned_users: 0,
    total_stores: 0,
    open_stores: 0,
    total_products: 0,
    total_orders: 0,
    orders_this_month: 0,
    revenue_all_cents: 0,
    revenue_month_cents: 0,
    paid_subs_count: 0,
  };

  return (
    <DashboardShell
      me={me}
      pageTitle="Ringkasan Platform"
      pageSubtitle="Angka agregat dari semua toko di SellOn"
    >
      <div className="flex flex-col gap-6">
        {/* Money tiles */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Pendapatan Semua Toko (paid)"
            value={formatRupiah(s.revenue_all_cents)}
            trend={{ direction: "flat", label: "Sejak SellOn berdiri" }}
          />
          <Stat
            label="Pendapatan Bulan Ini"
            value={formatRupiah(s.revenue_month_cents)}
            trend={{
              direction: s.revenue_month_cents > 0 ? "up" : "flat",
              label:
                s.orders_this_month > 0
                  ? `${s.orders_this_month} pesanan bulan ini`
                  : "Belum ada pesanan",
            }}
          />
          <Stat
            label="Langganan Berbayar Aktif"
            value={String(s.paid_subs_count)}
            trend={{ direction: "flat", label: "Pro + Bisnis aktif" }}
          />
        </div>

        {/* Volume tiles */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Total Pengguna"
            value={String(s.total_users)}
            trend={
              s.banned_users > 0
                ? { direction: "down", label: `${s.banned_users} diblokir` }
                : { direction: "flat", label: "Aktif semua" }
            }
          />
          <Stat
            label="Total Toko"
            value={String(s.total_stores)}
            trend={{
              direction: "flat",
              label: `${s.open_stores} sedang buka`,
            }}
          />
          <Stat
            label="Total Produk"
            value={String(s.total_products)}
            trend={{ direction: "flat", label: "Semua toko" }}
          />
          <Stat
            label="Total Pesanan"
            value={String(s.total_orders)}
            trend={{ direction: "flat", label: "Sepanjang waktu" }}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-neutral-900">Pengguna</h3>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Cari berdasarkan email/nama, lihat aktivitas, atau ban akun.
                </p>
              </div>
              <Link href="/platform/users">
                <Button size="sm" variant="outline">
                  <Users className="size-4" aria-hidden />
                  Buka
                </Button>
              </Link>
            </div>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-neutral-700">
              <li className="flex items-center gap-2">
                <TrendingUp className="size-4 text-success" aria-hidden />
                {s.total_users} terdaftar total
              </li>
              <li className="flex items-center gap-2">
                <Ban className="size-4 text-danger" aria-hidden />
                {s.banned_users} diblokir
              </li>
            </ul>
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-neutral-900">Toko & Harga</h3>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Lihat performa per toko, atur harga paket berlangganan, dan
                  cepat impersonate pemilik untuk troubleshooting.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Link href="/platform/stores">
                  <Button size="sm" variant="outline">
                    <Store className="size-4" aria-hidden />
                    Toko
                  </Button>
                </Link>
                <Link href="/platform/plans">
                  <Button size="sm" variant="outline">
                    <Tag className="size-4" aria-hidden />
                    Harga
                  </Button>
                </Link>
              </div>
            </div>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-neutral-700">
              <li className="flex items-center gap-2">
                <Package className="size-4 text-brand-600" aria-hidden />
                {s.total_products} produk lintas toko
              </li>
              <li className="flex items-center gap-2">
                <ShoppingBag className="size-4 text-brand-600" aria-hidden />
                {s.total_orders} pesanan tercatat
              </li>
              <li className="flex items-center gap-2">
                <CalendarDays className="size-4 text-warning" aria-hidden />
                {s.orders_this_month} pesanan bulan ini
              </li>
              <li className="flex items-center gap-2">
                <Crown className="size-4 text-warning" aria-hidden />
                {s.paid_subs_count} berlangganan aktif
              </li>
            </ul>
          </Card>
        </div>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-neutral-900">Transaksi</h3>
              <p className="mt-0.5 text-sm text-neutral-500">
                Lihat permintaan upgrade dari seller (transfer manual ke
                Bank). Aktifkan setelah verifikasi pembayaran masuk.
              </p>
            </div>
            <Link href="/platform/subscriptions">
              <Button size="sm" variant="outline">
                <Receipt className="size-4" aria-hidden />
                Buka
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
