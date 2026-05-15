"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  /**
   * Optional. When set, page changes update this URL searchParam (Link
   * navigation, server re-fetches). When omitted, the component falls
   * back to client-side via `onPageChange`.
   */
  paramName?: string;
  onPageChange?: (page: number) => void;
};

// Minimal pagination footer used across dashboard list tables. Renders
// "X-Y dari N" + icon-only prev/next + "p / total" indicator. Footer is
// only rendered when total > pageSize, so a single page never adds extra
// UI. When `paramName` is provided we navigate via URL searchParams (so
// the server re-fetches with `?{paramName}=N`); otherwise the parent owns
// page state via `onPageChange`.
export function TablePagination({
  page,
  pageSize,
  total,
  paramName,
  onPageChange,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);

  function hrefFor(target: number): string {
    if (!paramName) return "#";
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    if (target <= 1) sp.delete(paramName);
    else sp.set(paramName, String(target));
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const prevPage = Math.max(1, safePage - 1);
  const nextPage = Math.min(totalPages, safePage + 1);
  const prevDisabled = safePage <= 1;
  const nextDisabled = safePage >= totalPages;

  const navBtn = (
    direction: "prev" | "next",
    disabled: boolean,
    target: number,
  ) => {
    const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
    const label =
      direction === "prev" ? "Halaman sebelumnya" : "Halaman berikutnya";
    const cls =
      "flex size-7 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent";

    if (disabled || !paramName) {
      return (
        <button
          type="button"
          onClick={() => !disabled && onPageChange?.(target)}
          disabled={disabled}
          aria-label={label}
          className={cls}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      );
    }
    return (
      <Link
        href={hrefFor(target)}
        aria-label={label}
        className={cn(cls, "no-underline")}
      >
        <Icon className="size-4" aria-hidden />
      </Link>
    );
  };

  return (
    <div className="flex items-center justify-between text-xs text-neutral-600">
      <span>
        {rangeStart}-{rangeEnd} dari {total}
      </span>
      <div className="flex items-center gap-1">
        {navBtn("prev", prevDisabled, prevPage)}
        <span className="px-2 tabular-nums text-neutral-700">
          {safePage} / {totalPages}
        </span>
        {navBtn("next", nextDisabled, nextPage)}
      </div>
    </div>
  );
}

// Common page size for dashboard list tables. Centralized so they all
// stay in sync.
export const TABLE_PAGE_SIZE = 25;
