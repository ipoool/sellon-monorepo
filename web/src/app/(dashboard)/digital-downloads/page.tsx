import { redirect } from "next/navigation";
import Link from "next/link";
import { FileDown } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DigitalDownloadsTable } from "@/components/dashboard/digital-downloads-table";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { DigitalDownloadLink } from "@/lib/types";

export const metadata = { title: "Unduhan Digital — SellOn" };

const PAGE_SIZE = 25;

export default async function DigitalDownloadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((page - 1) * PAGE_SIZE));

  const data = await serverApi<{ links: DigitalDownloadLink[]; total: number }>(
    `/api/v1/digital-downloads?${params.toString()}`,
  );
  const links = data?.links ?? [];
  const total = data?.total ?? links.length;
  const isFiltered = Boolean(q);

  return (
    <DashboardShell
      me={me}
      pageTitle="Unduhan Digital"
      pageSubtitle="Audit akses link unduhan produk digital — pantau IP & perangkat untuk mendeteksi link yang dibagikan."
    >
      <form method="GET" className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input name="q" defaultValue={q} placeholder="Cari produk, nomor order, atau pelanggan…" />
        </div>
        <Button type="submit" size="md" variant="outline">
          Cari
        </Button>
        {isFiltered && (
          <Link href="/digital-downloads">
            <Button type="button" size="md" variant="ghost">
              Reset
            </Button>
          </Link>
        )}
      </form>

      {links.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <FileDown className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            {isFiltered ? "Tidak ada yang cocok" : "Belum ada link unduhan"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            {isFiltered
              ? "Coba ubah kata kunci atau reset pencarian."
              : "Link unduhan dibuat otomatis saat pesanan produk digital dibayar. Riwayat akses (IP, perangkat, jumlah unduh) muncul di sini."}
          </p>
        </Card>
      ) : (
        <>
          <DigitalDownloadsTable links={links} />
          <TablePagination page={page} total={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </DashboardShell>
  );
}
