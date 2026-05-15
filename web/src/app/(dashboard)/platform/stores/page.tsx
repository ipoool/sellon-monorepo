import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Search,
  ExternalLink,
  Crown,
  UserCog,
  Store as StoreIcon,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminGrantSubscriptionDialog } from "@/components/admin/admin-grant-subscription-dialog";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type { AdminStoreSummary } from "@/lib/types";

export const metadata = { title: "Toko Platform — SellOn" };

type SearchParams = Promise<{ q?: string }>;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function PlatformTokoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const params = await searchParams;
  const q = params.q ?? "";
  const url =
    "/api/v1/admin/stores?limit=50" +
    (q ? `&q=${encodeURIComponent(q)}` : "");
  const data = await serverApi<{ stores: AdminStoreSummary[] }>(url);
  const stores = data?.stores ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle="Toko"
      pageSubtitle="Cari toko, lihat performa, klik pemilik untuk impersonate"
    >
      <Card className="p-0">
        <form
          method="GET"
          className="border-b border-neutral-200 px-4 py-3 sm:px-5"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                <Search className="size-4" />
              </span>
              <Input
                name="q"
                defaultValue={q}
                placeholder="Cari nama toko, slug, atau email pemilik…"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline" size="md">
              Cari
            </Button>
          </div>
        </form>

        {stores.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
              <StoreIcon className="size-6" aria-hidden />
            </div>
            <p className="font-medium text-neutral-900">Tidak ada toko</p>
            <p className="max-w-sm text-sm text-neutral-600">
              {q
                ? `Tidak ada hasil untuk "${q}".`
                : "Belum ada toko terdaftar."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3 sm:px-5">Toko</th>
                  <th className="px-4 py-3">Pemilik</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Produk</th>
                  <th className="px-4 py-3 text-right">Pesanan</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3">Dibuat</th>
                  <th className="px-4 py-3 text-right sm:px-5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {stores.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                          <StoreIcon className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900">
                            {s.name}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            /{s.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/platform/users/${s.owner_user_id}`}
                        className="flex items-center gap-2 text-neutral-700 hover:text-neutral-900"
                      >
                        <Avatar
                          name={s.owner_name || s.owner_email}
                          size="xs"
                        />
                        <span className="truncate">
                          {s.owner_name || s.owner_email}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {s.plan === "free" ? (
                        <Badge variant="outline">Gratis</Badge>
                      ) : (
                        <Badge variant="warning" className="gap-1">
                          <Crown className="size-3" aria-hidden />
                          {s.plan === "pro" ? "Pro" : "Bisnis"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                      {s.products_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                      {s.orders_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">
                      {formatRupiah(s.revenue_cents)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <AdminGrantSubscriptionDialog
                          storeId={s.id}
                          storeName={s.name}
                          currentPlan={s.plan}
                          triggerVariant="ghost"
                        />
                        <a
                          href={`/${s.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="size-3.5" aria-hidden />
                            Toko
                          </Button>
                        </a>
                        <Link
                          href={`/platform/users/${s.owner_user_id}`}
                        >
                          <Button variant="ghost" size="sm">
                            <UserCog className="size-3.5" aria-hidden />
                            Pemilik
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}
