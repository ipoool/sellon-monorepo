import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Store } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { ResellerMembership, ResellerProgram } from "@/lib/types";

export const metadata = { title: "Reseller di Program — SellOn" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export default async function ProgramMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { id } = await params;

  const [programRes, membersRes] = await Promise.all([
    serverApi<{ program: ResellerProgram }>(`/api/v1/reseller/programs/${id}`),
    serverApi<{ members: ResellerMembership[] }>(`/api/v1/reseller/programs/${id}/members`),
  ]);

  if (!programRes?.program) notFound();

  const program = programRes.program;
  const members = membersRes?.members ?? [];

  return (
    <DashboardShell
      me={me}
      pageTitle={`Reseller: ${program.name}`}
      pageSubtitle={`${members.length} reseller bergabung`}
    >
      <div className="mb-4">
        <Link
          href="/reseller/program"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Kembali ke daftar program
        </Link>
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Users className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Belum ada reseller bergabung</p>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Bagikan kode undangan program ini ke calon reseller — mereka akan muncul di sini setelah join.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Toko Reseller</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-500">Bergabung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                        <Store className="size-4" aria-hidden />
                      </div>
                      <span className="font-medium text-neutral-900">
                        {m.supplier_store_name || "Toko Reseller"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={m.is_active ? "success" : "outline"}>
                      {m.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-500">
                    {formatDate(m.joined_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
