"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  Crown,
  Truck,
  ShoppingCart,
  Clock,
  ChevronDown,
  Boxes,
  ChefHat,
  GalleryHorizontalEnd,
  Download,
  type LucideIcon,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/components/auth/logout-button";
import { usePlan } from "@/components/dashboard/plan-context";
import { useKdsEnabled } from "@/components/dashboard/kds-context";
import { useMenuCapabilities } from "@/components/dashboard/menu-capabilities-context";
import { useBisnisGate } from "@/components/dashboard/bisnis-gate";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/auth-types";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  disabled?: boolean;
  external?: boolean;
  bisnisOnly?: boolean;
};

// isItemActive: a nav item is active when the path matches exactly, or (for
// non-root entries) when the path is nested under it. "Home" roots
// (/dashboard, /platform, /pos) match exactly only so they don't stay lit on
// every sub-page. Shared by item highlight + group auto-expand so they agree.
function isItemActive(href: string, pathname: string): boolean {
  const isHome = href === "/dashboard" || href === "/platform" || href === "/pos";
  return pathname === href || (!isHome && pathname.startsWith(href + "/"));
}

function groupHasActive(items: NavItem[], pathname: string): boolean {
  return items.some((i) => isItemActive(i.href, pathname));
}

// useGroupToggles persists which collapsible sidebar groups the seller has
// opened/closed, keyed by group label. Read via useSyncExternalStore so it's
// SSR-safe (server snapshot = empty → no hydration mismatch, no
// setState-in-effect) while a power seller's opened sections reappear on reload
// and a new user's untouched groups stay tidy and collapsed.
const SIDEBAR_GROUPS_KEY = "sellon:sidebar:groups";

type GroupState = Record<string, boolean>;
const EMPTY_GROUPS: GroupState = {};

// Cache so getSnapshot returns a stable reference until the stored value
// changes (useSyncExternalStore requires referential stability or it loops).
let groupsCache: { raw: string | null; parsed: GroupState } = { raw: null, parsed: EMPTY_GROUPS };
const groupListeners = new Set<() => void>();

function getGroupsSnapshot(): GroupState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SIDEBAR_GROUPS_KEY);
  } catch {
    return EMPTY_GROUPS;
  }
  if (raw !== groupsCache.raw) {
    let parsed: GroupState = EMPTY_GROUPS;
    try {
      parsed = raw ? (JSON.parse(raw) as GroupState) : EMPTY_GROUPS;
    } catch {
      parsed = EMPTY_GROUPS;
    }
    groupsCache = { raw, parsed };
  }
  return groupsCache.parsed;
}

function subscribeGroups(cb: () => void): () => void {
  groupListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SIDEBAR_GROUPS_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    groupListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function writeGroups(next: GroupState) {
  groupsCache = { raw: JSON.stringify(next), parsed: next };
  try {
    localStorage.setItem(SIDEBAR_GROUPS_KEY, groupsCache.raw!);
  } catch {
    // ignore
  }
  groupListeners.forEach((cb) => cb());
}

function useGroupToggles(): {
  get: (label: string) => boolean | undefined;
  set: (label: string, next: boolean) => void;
} {
  const groups = useSyncExternalStore(subscribeGroups, getGroupsSnapshot, () => EMPTY_GROUPS);
  // Takes the next value explicitly instead of flipping the stored one: a
  // group can be force-expanded by the active route while its stored flag is
  // still false, and flipping the stored flag then wrote `true` for a group
  // that was already open — silently expanding it on every other page.
  const set = useCallback(
    (label: string, next: boolean) => {
      writeGroups({ ...groups, [label]: next });
    },
    [groups],
  );
  return { get: (label) => groups[label], set };
}

const primaryNav: NavItem[] = [
  { label: "Dasbor", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pesanan", href: "/orders", icon: ShoppingBag },
  { label: "Produk", href: "/products", icon: Package },
  { label: "Unduhan Digital", href: "/digital-downloads", icon: Download },
  { label: "Bahan Baku", href: "/materials", icon: Boxes },
  { label: "Pembelian", href: "/purchase-orders", icon: Truck },
  { label: "Pelanggan", href: "/customers", icon: Users },
  { label: "Promo", href: "/promos", icon: Megaphone },
  { label: "Laporan & Analytics", href: "/analytics", icon: BarChart3 },
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

  // The drawer is only hidden by `lg:hidden` CSS — the <dialog> itself stays
  // open AND modal past the lg breakpoint, so rotating a tablet to landscape
  // left the whole document inert behind an invisible dialog. Close it when
  // the viewport reaches the desktop layout.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onClose]);

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
  const kdsEnabled = useKdsEnabled();
  // Which optional menu groups the owner enabled during profiling. Only used in
  // the seller-owner branch below; admin/staff branches ignore it.
  const caps = useMenuCapabilities();
  // Persisted open/closed state for collapsible groups (accordion).
  const groupToggles = useGroupToggles();
  // The core "Menu" group, minus the items the owner hid. Digital downloads is
  // one item; Bahan Baku + Pembelian are two items behind a single toggle.
  const ownerNav = primaryNav.filter((item) => {
    if (item.href === "/digital-downloads") return caps.digital;
    if (item.href === "/materials" || item.href === "/purchase-orders") return caps.materials;
    return true;
  });
  const tierLabel =
    plan === "pro" ? "Pro" : plan === "bisnis" ? "Bisnis" : "Free";
  // Badge variants: paid tiers get visual emphasis ("brand" for Pro,
  // "warning" gold for Bisnis), free stays neutral.
  const tierVariant =
    plan === "pro" ? "brand" : plan === "bisnis" ? "warning" : "outline";

  // Fade affordance: show a bottom gradient + chevron when the nav has
  // more items below the fold. Hides once scrolled (near) bottom so the
  // user knows there's nothing more to see.
  const navRef = useRef<HTMLElement>(null);
  const [showFade, setShowFade] = useState(false);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      setShowFade(el.scrollHeight - el.clientHeight - el.scrollTop > 8);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      <div className="flex h-16 items-center justify-between gap-3 border-b border-neutral-200 px-5">
        <div className="flex min-w-0 items-center gap-2">
            <Link href="/" aria-label="SellOn — Beranda">
            <img
              src="/sellon-logo.svg"
              alt="SellOn"
              className="h-7 w-auto"
            />
          </Link>
        </div>
        <Link href="/settings/subscription" aria-label="Lihat langganan">
          <Badge variant={tierVariant} className="inline-flex items-center gap-1">
            {plan === "pro" && <Zap className="size-3" aria-hidden />}
            {plan === "bisnis" && <Crown className="size-3" aria-hidden />}
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
      <div className="relative flex min-h-0 flex-1 flex-col">
      <nav
        ref={navRef}
        className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto p-3"
      >
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
                {
                  label: "Banner",
                  href: "/platform/banners",
                  icon: GalleryHorizontalEnd,
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
          // Staff members: operasional + POS
          <>
            <NavGroup
              label="Menu"
              items={[
                { label: "Pesanan", href: "/orders", icon: ShoppingBag },
                { label: "Produk", href: "/products", icon: Package },
              ]}
              pathname={pathname}
            />
            <NavGroup
              bisnisOnly
              label="Kasir POS"
              labelHref="/pos"
              items={[
                { label: "Buka Kasir", href: "/pos", icon: ShoppingCart },
                { label: "Riwayat Shift", href: "/pos/sessions", icon: Clock },
              ]}
              pathname={pathname}
            />
          </>
        ) : (
          <>
            <NavGroup label="Menu" items={ownerNav} pathname={pathname} />
            {/* Optional groups: rendered only when the owner enabled them during
                profiling. Tier still gates ACCESS — cap_pos on a Free seller
                shows the group locked (Crown → upgrade dialog); cap off hides it
                entirely. */}
            {caps.pos && (
              <NavGroup
                bisnisOnly
                collapsible
                isOpen={groupToggles.get("Kasir POS")}
                onToggle={(next) => groupToggles.set("Kasir POS", next)}
                label="Kasir POS"
                labelHref="/pos"
                items={[
                  { label: "Buka Kasir", href: "/pos", icon: ShoppingCart },
                  // Kitchen Display only when the seller runs a KDS — otherwise
                  // dine-in orders skip the kitchen pipeline and the board is empty.
                  ...(kdsEnabled
                    ? [{ label: "Kitchen Display", href: "/kds", icon: ChefHat }]
                    : []),
                  { label: "Riwayat Shift", href: "/pos/sessions", icon: Clock },
                  { label: "Riwayat Transaksi", href: "/pos/transactions", icon: Receipt },
                  { label: "Laporan POS", href: "/pos/reports", icon: BarChart3 },
                ]}
                pathname={pathname}
              />
            )}
            {caps.reseller && (
              <NavGroup
                collapsible
                isOpen={groupToggles.get("Program Reseller")}
                onToggle={(next) => groupToggles.set("Program Reseller", next)}
                label="Program Reseller"
                labelHref="/reseller/program"
                items={[
                  { label: "Program Supplier", href: "/reseller/program", icon: Store },
                  { label: "Order Dropship", href: "/reseller/orders", icon: Truck },
                  { label: "Supplier Saya", href: "/reseller/suppliers", icon: Users },
                  { label: "Katalog Reseller", href: "/reseller/catalog", icon: Package },
                ]}
                pathname={pathname}
              />
            )}
            <NavGroup
              collapsible
              isOpen={groupToggles.get("Lainnya")}
              onToggle={(next) => groupToggles.set("Lainnya", next)}
              label="Lainnya"
              items={secondaryNav}
              pathname={pathname}
            />
          </>
        )}
      </nav>

      {/* Scroll affordance: fade + bouncing chevron, only when more
          items exist below the fold. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-white via-white/85 to-transparent pb-2 transition-opacity duration-200",
          showFade ? "opacity-100" : "opacity-0",
        )}
      >
        <ChevronDown className="size-4 animate-bounce text-neutral-400" aria-hidden />
      </div>
      </div>

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
  labelHref,
  items,
  pathname,
  bisnisOnly,
  collapsible,
  isOpen,
  onToggle,
}: {
  label: string;
  labelHref?: string;
  items: NavItem[];
  pathname: string;
  // When true the whole group is a Bisnis feature: it stays visible for every
  // tier, but non-Bisnis sellers get the upgrade dialog on click instead of
  // navigating.
  bisnisOnly?: boolean;
  // Collapsible groups show a chevron toggle and hide their items when closed.
  // The group that contains the active route always force-expands so the user
  // never lands on a page whose nav item is hidden. isOpen is the persisted
  // toggle (undefined = never touched → collapsed by default).
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const { locked, openGate } = useBisnisGate();
  const groupLocked = !!bisnisOnly && locked;
  const containsActive = groupHasActive(items, pathname);
  const open = !collapsible || containsActive || (isOpen ?? false);
  const labelClass =
    "text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700";
  return (
    <div>
      <div className="flex items-center justify-between gap-1 pb-2 pl-3 pr-2">
        {groupLocked ? (
          <button
            type="button"
            onClick={() => openGate("Kasir POS")}
            className={cn("text-left", labelClass)}
          >
            {label}
          </button>
        ) : labelHref ? (
          <Link href={labelHref} className={labelClass}>
            {label}
          </Link>
        ) : (
          <p className={labelClass}>{label}</p>
        )}
        {collapsible && (
          // The group holding the active route is force-expanded so the user
          // never lands on a page whose nav item is hidden — so the chevron
          // genuinely cannot collapse it. Disable it there rather than let it
          // look clickable, do nothing, and still write to localStorage.
          <button
            type="button"
            onClick={() => onToggle?.(!open)}
            disabled={containsActive}
            aria-expanded={open}
            aria-label={open ? `Tutup ${label}` : `Buka ${label}`}
            title={
              containsActive
                ? "Grup ini terbuka karena halaman aktif ada di dalamnya"
                : undefined
            }
            className="flex size-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        )}
      </div>
      {open && (
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isItemActive(item.href, pathname);
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

          // Bisnis-only items stay visible but pop the upgrade dialog on
          // click (no navigation) for non-Bisnis sellers.
          if (groupLocked || (!!item.bisnisOnly && locked)) {
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => openGate(item.label)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                >
                  <Icon className="size-4 shrink-0 text-neutral-500" aria-hidden />
                  <span className="flex-1 text-left">{item.label}</span>
                  <Crown className="size-3.5 shrink-0 text-amber-500" aria-hidden />
                </button>
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
      )}
    </div>
  );
}
