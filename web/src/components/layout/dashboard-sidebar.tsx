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
  ShieldCheck,
  Store,
  Tag,
  Receipt,
  UserCog,
  X,
  Zap,
  Building2,
  type LucideIcon,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/components/auth/logout-button";
import { usePlan } from "@/components/dashboard/plan-context";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/auth-types";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  disabled?: boolean;
  external?: boolean;
};

const primaryNav: NavItem[] = [
  { label: "Dasbor", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pesanan", href: "/orders", icon: ShoppingBag },
  { label: "Produk", href: "/products", icon: Package },
  { label: "Pelanggan", href: "/customers", icon: Users },
  { label: "Promo", href: "/promos", icon: Megaphone },
  { label: "Laporan", href: "/reports", icon: BarChart3 },
];

const secondaryNav: NavItem[] = [
  { label: "Pengaturan", href: "/settings", icon: Settings },
  { label: "Bantuan", href: "/help", icon: HelpCircle, external: true },
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
      <aside className="hidden border-r border-neutral-200 bg-white lg:fixed lg:bottom-0 lg:left-0 lg:top-[var(--banners-h,0px)] lg:z-30 lg:flex lg:w-60 lg:flex-col">
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
  const plan = usePlan();
  const tierLabel =
    plan === "pro" ? "Pro" : plan === "bisnis" ? "Bisnis" : "Free";
  // Badge variants: paid tiers get visual emphasis ("brand" for Pro,
  // "warning" gold for Bisnis), free stays neutral.
  const tierVariant =
    plan === "pro" ? "brand" : plan === "bisnis" ? "warning" : "outline";
  return (
    <>
      <div className="flex h-16 items-center justify-between gap-3 border-b border-neutral-200 px-5">
        <div className="flex min-w-0 items-center gap-2">
            <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-neutral-900"
          >
            SellOn
          </Link>
        </div>
        <Link href="/settings/subscription" aria-label="Lihat langganan">
          <Badge variant={tierVariant} className="inline-flex items-center gap-1">
            {plan === "pro" && <Zap className="size-3" aria-hidden />}
            {plan === "bisnis" && <Building2 className="size-3" aria-hidden />}
            {tierLabel}
          </Badge>
        </Link>
      </div>

      {/* Sidebar nav diverges by role:
            - Admin (not impersonating): platform-only items. Seller
              menu (Pesanan/Produk/etc) is irrelevant since admins
              don't have their own store.
            - Seller (or admin currently impersonating): the regular
              seller menu, no platform items. */}
      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto p-3">
        {me.role === "admin" && !me.is_impersonated ? (
          <>
            <NavGroup
              label="Menu"
              items={[
                {
                  label: "Dasbor",
                  href: "/platform",
                  icon: LayoutDashboard,
                },
                {
                  label: "Pengguna",
                  href: "/platform/users",
                  icon: Users,
                },
                {
                  label: "Toko",
                  href: "/platform/stores",
                  icon: Store,
                },
                {
                  label: "Harga Paket",
                  href: "/platform/plans",
                  icon: Tag,
                },
                {
                  label: "Transaksi",
                  href: "/platform/subscriptions",
                  icon: Receipt,
                },
              ]}
              pathname={pathname}
            />
            <NavGroup
              label="Lainnya"
              items={[{ label: "Bantuan", href: "/help", icon: HelpCircle, external: true }]}
              pathname={pathname}
            />
          </>
        ) : me.store_role === "staff" ? (
          // Staff members: operasional only — orders + products
          <NavGroup
            label="Menu"
            items={[
              { label: "Pesanan", href: "/orders", icon: ShoppingBag },
              { label: "Produk", href: "/products", icon: Package },
            ]}
            pathname={pathname}
          />
        ) : (
          <>
            <NavGroup label="Menu" items={primaryNav} pathname={pathname} />
            <NavGroup label="Lainnya" items={secondaryNav} pathname={pathname} />
          </>
        )}
      </nav>

      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar src={me.picture_url} name={me.name || me.email} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">
              {me.name || me.email}
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <RoleDot me={me} />
              <p className="truncate text-xs text-neutral-500">{me.email}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </>
  );
}

// RoleDot is the compact role indicator shown inline with the email
// in the sidebar. Only renders for non-default sessions worth flagging:
// admins (always show) and impersonation (override admin). Regular
// sellers don't get a chip — their email already identifies them and
// "Penjual" was redundant noise.
function RoleDot({ me }: { me: Me }) {
  if (me.is_impersonated) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-danger">
        <UserCog className="size-3" aria-hidden />
        Imp
      </span>
    );
  }
  if (me.role === "admin") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
        <ShieldCheck className="size-3" aria-hidden />
        Admin
      </span>
    );
  }
  return null;
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
          // "Home" entries match exactly only — otherwise the seller
          // /dashboard link stays highlighted on every /dashboard/* sub-page,
          // and the admin /platform link does the same on
          // /platform/users etc. Anything deeper still
          // highlights when its prefix matches.
          const isHome =
            item.href === "/dashboard" || item.href === "/platform";
          const active =
            pathname === item.href ||
            (!isHome && pathname.startsWith(item.href + "/"));
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
                {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
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
