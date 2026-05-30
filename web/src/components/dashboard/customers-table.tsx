"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, MessageCircle, ArrowRight } from "lucide-react";

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

// Loyalty tiers now live in Settings → Membership (based on total spend). The
// old order-count "segment" buckets were removed; here we only keep a
// Blacklist filter/marker, which is a real flag on the customer.
type Filter = "all" | "blacklist";

export function CustomersTable({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const pageSize = TABLE_PAGE_SIZE;

  // Reset to page 1 whenever the filter inputs change so the user never
  // sees an empty page after narrowing the result set.
  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const blacklistCount = useMemo(
    () => customers.filter((c) => c.is_blacklisted).length,
    [customers],
  );

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Semua", count: customers.length },
    { key: "blacklist", label: "Blacklist", count: blacklistCount },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter === "blacklist" && !c.is_blacklisted) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.whatsapp_number.includes(q) ||
        c.city.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [customers, query, filter]);

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
              onClick={() => setFilter(t.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === t.key
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {t.label} <span className="ml-0.5 text-neutral-400">{t.count}</span>
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
                  className="group/row cursor-pointer hover:bg-neutral-50"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/customers/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar name={c.name} size="sm" />
                      <div>
                        <p className="flex items-center gap-2 font-medium text-neutral-900 group-hover/row:text-brand-700">
                          {c.name}
                          {c.is_blacklisted && (
                            <Badge variant="warning">Blacklist</Badge>
                          )}
                        </p>
                        <p className="font-mono text-xs text-neutral-500">
                          {c.whatsapp_number}
                        </p>
                      </div>
                    </Link>
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
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
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
                      <Tooltip label="Lihat detail" align="end">
                        <Link
                          href={`/customers/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
                          aria-label={`Lihat detail ${c.name}`}
                        >
                          <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      </Tooltip>
                    </div>
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
