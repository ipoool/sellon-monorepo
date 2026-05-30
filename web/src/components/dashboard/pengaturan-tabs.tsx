"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Store,
  CreditCard,
  Globe,
  Truck,
  MessageCircle,
  Tag,
  Crown,
  Users,
  Palette,
  History,
  Sparkles,
  Award,
  Printer,
  QrCode,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBisnisGate } from "@/components/dashboard/bisnis-gate";

// bisnisOnly tabs are hidden unless the seller is on the Bisnis tier (the
// pages themselves also guard server-side, and the API enforces 402).
const tabs = [
  { label: "Profil Toko", href: "/settings/store", icon: Store },
  { label: "Storefront", href: "/settings/storefront", icon: Palette },
  { label: "Domain", href: "/settings/domain", icon: Globe },
  { label: "Pembayaran", href: "/settings/payment", icon: CreditCard },
  { label: "Loyalty", href: "/settings/loyalty", icon: Sparkles, bisnisOnly: true },
  { label: "Membership", href: "/settings/membership", icon: Award, bisnisOnly: true },
  { label: "Meja & QR", href: "/settings/tables", icon: QrCode, bisnisOnly: true },
  { label: "Kategori", href: "/settings/categories", icon: Tag },
  { label: "Pengiriman", href: "/settings/shipping", icon: Truck },
  { label: "Field Checkout", href: "/settings/checkout", icon: ClipboardList, bisnisOnly: true },
  { label: "Printer", href: "/settings/printer", icon: Printer, bisnisOnly: true },
  { label: "WhatsApp", href: "/settings/whatsapp", icon: MessageCircle },
  { label: "Tim", href: "/settings/team", icon: Users },
  { label: "Aktivitas", href: "/settings/activity", icon: History },
  { label: "Berlangganan", href: "/settings/subscription", icon: Crown },
];

export function PengaturanTabs() {
  const pathname = usePathname();
  const { locked, openGate } = useBisnisGate();

  return (
    // Vertical tab rail on desktop (lg+): stacks as a left column beside
    // the content. On mobile it falls back to a horizontal scroll row so
    // the tabs don't push the content far down the page. Pill highlight
    // works for both orientations (an underline would only fit horizontal).
    <nav className="no-scrollbar -mx-4 flex flex-row gap-1 overflow-x-auto border-b border-neutral-200 px-4 pb-2 sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:border-b-0 lg:pb-0">
      {tabs.map(({ label, href, icon: Icon, bisnisOnly }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        const tabLocked = !!bisnisOnly && locked;
        const className = cn(
          "group flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors lg:w-full",
          active
            ? "bg-brand-50 font-semibold text-brand-700"
            : "font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
        );
        const iconEl = (
          <Icon
            className={cn(
              "size-4 shrink-0 transition-colors",
              active ? "text-brand-600" : "text-neutral-400 group-hover:text-neutral-600",
            )}
            aria-hidden
          />
        );

        // Bisnis-only tabs stay visible; clicking them as a non-Bisnis seller
        // opens the upgrade dialog instead of navigating.
        if (tabLocked) {
          return (
            <button
              key={href}
              type="button"
              onClick={() => openGate(label)}
              className={cn(className, "text-left")}
            >
              {iconEl}
              {label}
              <Crown className="ml-auto size-3.5 shrink-0 text-amber-500" aria-hidden />
            </button>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {iconEl}
            {label}
            <ChevronRight
              className={cn(
                "ml-auto hidden size-4 shrink-0 text-brand-600 transition-opacity lg:block",
                active ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
          </Link>
        );
      })}
    </nav>
  );
}
