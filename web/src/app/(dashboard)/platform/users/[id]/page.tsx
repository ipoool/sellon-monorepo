import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, Calendar, Crown } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { AdminPlatformAuditList } from "@/components/admin/admin-platform-audit-list";
import { AdminGrantSubscriptionDialog } from "@/components/admin/admin-grant-subscription-dialog";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { formatRupiah } from "@/lib/format";
import type {
  AdminStoreSummary,
  AdminUser,
  PlatformAuditEntry,
} from "@/lib/types";

type Params = Promise<{ id: string }>;

type Resp = {
  user: AdminUser;
  stores: AdminStoreSummary[];
  platform_audit: PlatformAuditEntry[];
};

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PlatformPenggunaDetailPage({
  params,
}: {
  params: Params;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || me.is_impersonated) redirect("/dashboard");

  const { id } = await params;
  const data = await serverApi<Resp>(`/api/v1/admin/users/${id}`);
  if (!data) notFound();

  const { user, stores, platform_audit: platformAudit } = data;
  const banned = !!user.banned_at;

  return (
    <DashboardShell
      me={me}
      pageTitle={user.name || "(belum isi nama)"}
      pageSubtitle={user.email}
    >
      <div className="flex flex-col gap-6">
        <Link
          href="/platform/users"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Semua pengguna
        </Link>

        <header className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-card sm:flex-row sm:items-start sm:gap-5">
          <Avatar src={user.picture_url} name={user.name || user.email} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
                {user.name || "(belum isi nama)"}
              </h2>
              {user.role === "admin" && (
                <Badge variant="brand">Admin platform</Badge>
              )}
              {banned ? (
                <Badge variant="danger">Diblokir</Badge>
              ) : (
                <Badge variant="success">Aktif</Badge>
              )}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
              <li className="flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                {user.email}
              </li>
              <li className="flex items-center gap-1.5">
                <Calendar className="size-3.5" aria-hidden />
                Bergabung {formatDate(user.created_at)}
              </li>
              {banned && user.banned_at && (
                <li className="flex items-center gap-1.5 text-danger">
                  Diblokir sejak {formatDate(user.banned_at)}
                </li>
              )}
            </ul>
          </div>
          <AdminUserActions user={user} />
        </header>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-neutral-900">
            Toko yang dimiliki
          </h2>
          {stores.length === 0 ? (
            <Card>
              <p className="text-sm text-neutral-600">
                Pengguna ini belum punya toko.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {stores.map((s) => (
                <Card key={s.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-neutral-900">
                        {s.name}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        /{s.slug}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {s.plan !== "free" && (
                        <Badge variant="warning" className="gap-1">
                          <Crown className="size-3" aria-hidden />
                          {s.plan}
                        </Badge>
                      )}
                      <Badge variant={s.is_open ? "success" : "outline"}>
                        {s.is_open ? "Buka" : "Tutup"}
                      </Badge>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-neutral-50 p-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        Produk
                      </dt>
                      <dd className="mt-0.5 font-display text-base font-semibold text-neutral-900">
                        {s.products_count}
                      </dd>
                    </div>
                    <div className="rounded-md bg-neutral-50 p-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        Pesanan
                      </dt>
                      <dd className="mt-0.5 font-display text-base font-semibold text-neutral-900">
                        {s.orders_count}
                      </dd>
                    </div>
                    <div className="rounded-md bg-neutral-50 p-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        Revenue
                      </dt>
                      <dd className="mt-0.5 font-display text-sm font-semibold text-neutral-900">
                        {formatRupiah(s.revenue_cents)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <AdminGrantSubscriptionDialog
                      storeId={s.id}
                      storeName={s.name}
                      currentPlan={s.plan}
                    />
                    <a
                      href={`/${s.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="size-3.5" aria-hidden />
                        Buka toko publik
                      </Button>
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-neutral-900">
            Riwayat Tindakan Admin
          </h2>
          <AdminPlatformAuditList entries={platformAudit} />
        </section>
      </div>
    </DashboardShell>
  );
}
