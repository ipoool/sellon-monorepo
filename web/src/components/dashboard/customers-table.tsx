"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, MessageCircle } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { formatRupiah, formatDateID } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/types";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/dashboard/table-pagination";

type Segment = "all" | "vip" | "loyal" | "reguler" | "baru" | "blacklist";

type SegmentMeta = {
  label: string;
  variant: "default" | "brand" | "success" | "warning";
};

function classify(c: Customer): { key: Segment; meta: SegmentMeta } {
  if (c.is_blacklisted)
    return { key: "blacklist", meta: { label: "Blacklist", variant: "warning" } };
  if (c.total_orders >= 10)
    return { key: "vip", meta: { label: "VIP", variant: "brand" } };
  if (c.total_orders >= 3)
    return { key: "loyal", meta: { label: "Loyal", variant: "success" } };
  if (c.total_orders >= 1)
    return { key: "reguler", meta: { label: "Reguler", variant: "default" } };
  return { key: "baru", meta: { label: "Baru", variant: "default" } };
}

const filterTabs: { key: Segment; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "vip", label: "VIP" },
  { key: "loyal", label: "Loyal" },
  { key: "reguler", label: "Reguler" },
  { key: "baru", label: "Baru" },
  { key: "blacklist", label: "Blacklist" },
];

export function CustomersTable({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [page, setPage] = useState(1);
  const pageSize = TABLE_PAGE_SIZE;

  // Reset to page 1 whenever the filter inputs change so the user never
  // sees an empty page after narrowing the result set.
  useEffect(() => {
    setPage(1);
  }, [query, segment]);

  const enriched = useMemo(
    () =>
      customers.map((c) => ({
        ...c,
        ...classify(c),
      })),
    [customers],
  );

  const counts = useMemo(() => {
    const c: Record<Segment, number> = {
      all: enriched.length,
      vip: 0,
      loyal: 0,
      reguler: 0,
      baru: 0,
      blacklist: 0,
    };
    for (const e of enriched) c[e.key]++;
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((c) => {
      if (segment !== "all" && c.key !== segment) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.whatsapp_number.includes(q) ||
        c.city.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [enriched, query, segment]);

  // Clamp page lazily so the slice stays valid if the dataset shrinks
  // below the current page (e.g. user toggles segment after navigating
  // to page 4).
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const sliceStart = (safePage - 1) * pageSize;
  const paged = filtered.slice(sliceStart, sliceStart + pageSize);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, WhatsApp, atau kota…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSegment(t.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                segment === t.key
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {t.label}{" "}
              <span className="ml-0.5 text-neutral-400">
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500">
          Tidak ada pelanggan yang cocok.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3">Pelanggan</th>
                <th className="px-5 py-3">Segmen</th>
                <th className="px-5 py-3">Kota</th>
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Total Belanja</th>
                <th className="px-5 py-3">Terakhir</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {paged.map((c) => (
                <tr
                  key={c.id}
                  className="group cursor-pointer hover:bg-neutral-50"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/customers/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar name={c.name} size="sm" />
                      <div>
                        <p className="font-medium text-neutral-900 group-hover:text-brand-700">
                          {c.name}
                        </p>
                        <p className="font-mono text-xs text-neutral-500">
                          {c.whatsapp_number}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={c.meta.variant}>{c.meta.label}</Badge>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{c.city || "—"}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {c.total_orders}
                  </td>
                  <td className="px-5 py-3 font-medium text-neutral-900">
                    {formatRupiah(c.total_spent_cents)}
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {c.last_order_at ? formatDateID(c.last_order_at) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {c.whatsapp_number && (
                      <Tooltip label="Hubungi via WhatsApp" align="end">
                        <a
                          href={waLink(
                            c.whatsapp_number,
                            `Halo ${c.name}, ada update dari tokomu :)`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
                          aria-label={`Hubungi ${c.name} via WhatsApp`}
                        >
                          <MessageCircle className="size-4" aria-hidden />
                        </a>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TablePagination
        page={safePage}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
      />
    </div>
  );
}
