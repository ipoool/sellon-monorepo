"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Bell, Search } from "lucide-react";

import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { BulkJobWatcher } from "@/components/dashboard/bulk-job-watcher";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/auth-types";

type Props = {
  me: Me;
  pageTitle: string;
  pageSubtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function DashboardShell({
  me,
  pageTitle,
  pageSubtitle,
  actions,
  children,
}: Props) {
  const { push } = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Submit topbar search → /products?q=… The product list page
  // already supports `q` server-side, so this Just Works™ without
  // having to build a separate global-search backend.
  function onSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = searchQuery.trim();
    push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  }

  return (
    <div className="min-h-svh bg-neutral-50">
      <DashboardSidebar
        me={me}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className={cn("lg:pl-60")}>
        <header className="sticky top-[var(--banners-h,0px)] z-20 border-b border-neutral-200 bg-white/85 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-neutral-700 transition-colors hover:bg-neutral-100 lg:hidden"
              aria-label="Buka menu"
            >
              <Menu className="size-5" aria-hidden />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-semibold tracking-tight text-neutral-900">
                {pageTitle}
              </h1>
              {pageSubtitle && (
                <p className="truncate text-xs text-neutral-500">
                  {pageSubtitle}
                </p>
              )}
            </div>

            <form
              onSubmit={onSearchSubmit}
              className="hidden md:block md:w-72"
              role="search"
            >
              <label htmlFor="topbar-search" className="sr-only">
                Cari produk
              </label>
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400"
                >
                  <Search className="size-4" />
                </span>
                <input
                  id="topbar-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari produk… (Enter)"
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            </form>

            <Link
              href="/orders"
              className="rounded-md p-2 text-neutral-600 transition-colors hover:bg-neutral-100"
              aria-label="Lihat pesanan"
              title="Lihat pesanan"
            >
              <Bell className="size-5" aria-hidden />
            </Link>

            <div className="lg:hidden">
              <Avatar src={me.picture_url} name={me.name || me.email} />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            {/* Page header (desktop only — mobile uses topbar title) */}
            <div className="hidden items-end justify-between gap-4 pb-6 lg:flex">
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                  {pageTitle}
                </h2>
                {pageSubtitle && (
                  <p className="mt-1 text-sm text-neutral-600">{pageSubtitle}</p>
                )}
              </div>
              {actions && (
                <div className="flex items-center gap-2">{actions}</div>
              )}
            </div>

            {/* Mobile actions */}
            {actions && (
              <div className="mb-4 flex items-center gap-2 lg:hidden">
                {actions}
              </div>
            )}

            {children}
          </div>
        </main>
      </div>

      {/* Global cross-page bulk upload progress notifications. Lives di
          dalam dashboard shell — landing page tidak terkena karena tidak
          memakai shell ini. */}
      <BulkJobWatcher />
    </div>
  );
}
