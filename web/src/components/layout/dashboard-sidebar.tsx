"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Megaphone,
  BarChart3,
  Settings,
  HelpCircle,
  X,
  type LucideIcon,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/auth-types";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  disabled?: boolean;
};

const primaryNav: NavItem[] = [
  { label: "Dasbor", href: "/dasbor", icon: LayoutDashboard },
  { label: "Pesanan", href: "/dasbor/pesanan", icon: ShoppingBag },
  { label: "Produk", href: "/dasbor/produk", icon: Package },
  { label: "Pelanggan", href: "/dasbor/pelanggan", icon: Users },
  { label: "Promo", href: "/dasbor/promo", icon: Megaphone },
  { label: "Laporan", href: "/dasbor/laporan", icon: BarChart3 },
];

const secondaryNav: NavItem[] = [
  { label: "Pengaturan", href: "/dasbor/pengaturan", icon: Settings },
  { label: "Bantuan", href: "/bantuan", icon: HelpCircle },
];

type Props = {
  me: Me;
  open: boolean;
  onClose: () => void;
};

export function DashboardSidebar({ me, open, onClose }: Props) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    const onCancel = () => onClose();
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  }, [onClose]);

  // Close drawer when navigation happens
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-neutral-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60 lg:flex-col">
        <SidebarContent me={me} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      <dialog
        ref={dialogRef}
        aria-label="Menu navigasi"
        className="fixed inset-y-0 left-0 m-0 h-svh max-h-none w-72 max-w-[85vw] border-r border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm lg:hidden"
      >
        <div className="flex h-full flex-col">
          <SidebarContent me={me} pathname={pathname} onClose={onClose} />
        </div>
      </dialog>
    </>
  );
}

function SidebarContent({
  me,
  pathname,
  onClose,
}: {
  me: Me;
  pathname: string;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center justify-between gap-3 border-b border-neutral-200 px-5">
        <div className="flex min-w-0 items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup menu"
              className="-ml-2 flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-neutral-900"
          >
            SellOn
          </Link>
        </div>
        <Badge variant="success">Aktif</Badge>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto p-3">
        <NavGroup label="Menu" items={primaryNav} pathname={pathname} />
        <NavGroup label="Lainnya" items={secondaryNav} pathname={pathname} />
      </nav>

      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar src={me.picture_url} name={me.name || me.email} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">
              {me.name || me.email}
            </p>
            <p className="truncate text-xs text-neutral-500">{me.email}</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </>
  );
}

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          // /dasbor only matches exactly; nested routes match by prefix.
          const active =
            pathname === item.href ||
            (item.href !== "/dasbor" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <li key={item.label}>
                <span
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400"
                  title="Akan segera hadir"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">
                      {item.badge}
                    </span>
                  )}
                </span>
              </li>
            );
          }

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-neutral-700 hover:bg-neutral-100",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-brand-600" : "text-neutral-500",
                  )}
                  aria-hidden
                />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs font-medium",
                      active
                        ? "bg-brand-100 text-brand-700"
                        : "bg-neutral-100 text-neutral-600",
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
