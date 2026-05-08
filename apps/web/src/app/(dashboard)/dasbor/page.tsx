import { redirect } from "next/navigation";
import {
  Plus,
  PackageOpen,
  Share2,
  ArrowDownToLine,
  Inbox,
  ShoppingBag,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";

const stats = [
  {
    label: "Pesanan Hari Ini",
    value: "12",
    trend: { direction: "up" as const, label: "+25% dari kemarin" },
    sparkline: [3, 4, 2, 5, 7, 6, 8, 9, 10, 12],
  },
  {
    label: "Pendapatan Bulan Ini",
    value: "Rp 4,8jt",
    trend: { direction: "up" as const, label: "+12% dari bulan lalu" },
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
  { icon: Plus, label: "Buat Produk Baru" },
  { icon: PackageOpen, label: "Lihat Pesanan" },
  { icon: Share2, label: "Salin Link Katalog" },
  { icon: ArrowDownToLine, label: "Tarik Saldo" },
];

function timeBasedGreeting() {
  // Use UTC+7 (WIB) since this is for Indonesia.
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

  return (
    <>
      <Header me={me} variant="app" />
      <main className="bg-neutral-50 pb-16 pt-8 lg:pt-10">
        <Container>
          {/* Greeting */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar src={me.picture_url} name={me.name} size="lg" />
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                  {greeting}, {firstName}
                </h1>
                <p className="mt-0.5 text-sm text-neutral-600">
                  Hari ini ada{" "}
                  <span className="font-medium text-neutral-900">
                    3 pesanan baru
                  </span>{" "}
                  dan{" "}
                  <span className="font-medium text-neutral-900">2 produk</span>{" "}
                  perlu di-restock.
                </p>
              </div>
            </div>
            <Badge variant="success" className="self-start sm:self-auto">
              Toko aktif
            </Badge>
          </div>

          {/* Quick actions */}
          <div className="mt-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-2 sm:flex-wrap">
              {quickActions.map(({ icon: Icon, label }) => (
                <Button
                  key={label}
                  size="sm"
                  variant="outline"
                  className="bg-white"
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

          {/* Recent orders + Top products */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">
                    Pesanan Terbaru
                  </h2>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    3 pesanan menunggu konfirmasi
                  </p>
                </div>
                <Button size="sm" variant="ghost">
                  Lihat semua
                </Button>
              </div>

              <EmptyState
                icon={Inbox}
                title="Belum ada pesanan baru"
                description="Bagikan link katalog ke WhatsApp grup pelanggan-mu untuk mulai terima pesanan."
                cta="Salin Link Katalog"
              />
            </Card>

            <Card>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">
                    Produk Terlaris
                  </h2>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    7 hari terakhir
                  </p>
                </div>
                <Button size="sm" variant="ghost">
                  Kelola produk
                </Button>
              </div>

              <EmptyState
                icon={ShoppingBag}
                title="Tambah produk pertamamu"
                description="Foto produk + harga sudah cukup untuk mulai. Bisa di-edit kapan saja."
                cta="Buat Produk Baru"
              />
            </Card>
          </div>
        </Container>
      </main>
    </>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-neutral-900">{title}</p>
        <p className="mt-1 max-w-xs text-sm text-neutral-600">{description}</p>
      </div>
      <Button size="sm" className="mt-2">
        {cta}
      </Button>
    </div>
  );
}
