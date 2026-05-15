"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Store,
  CreditCard,
  Truck,
  MessageCircle,
  Tag,
  Crown,
  Users,
  Palette,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Profil Toko", href: "/settings/store", icon: Store },
  { label: "Storefront", href: "/settings/storefront", icon: Palette },
  { label: "Pembayaran", href: "/settings/payment", icon: CreditCard },
  { label: "Kategori", href: "/settings/categories", icon: Tag },
  { label: "Pengiriman", href: "/settings/shipping", icon: Truck },
  { label: "WhatsApp", href: "/settings/whatsapp", icon: MessageCircle },
  { label: "Tim", href: "/settings/team", icon: Users },
  { label: "Aktivitas", href: "/settings/activity", icon: History },
  { label: "Berlangganan", href: "/settings/subscription", icon: Crown },
];

export function PengaturanTabs() {
  const pathname = usePathname();

  return (
    // Wrapper is `relative` so the right-edge fade can hint horizontal
    // overflow on viewports too narrow for all 9 tabs (e.g., 1280px).
    // The fade pseudo-overlay is decorative — scrolling itself is handled
    // by `overflow-x-auto` on the inner nav.
    <div className="relative -mx-4 sm:mx-0">
      <nav className="overflow-x-auto border-b border-neutral-200 px-4 sm:px-0">
        <ul className="flex gap-0.5 whitespace-nowrap">
          {tabs.map(({ label, href, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2 border-b-2 px-2.5 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-neutral-600 hover:text-neutral-900",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-neutral-50 to-transparent"
      />
    </div>
  );
}
