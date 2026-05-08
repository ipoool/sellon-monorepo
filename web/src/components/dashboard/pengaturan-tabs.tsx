"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, CreditCard, Truck, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Profil Toko", href: "/dasbor/pengaturan/toko", icon: Store },
  { label: "Pembayaran", href: "/dasbor/pengaturan/pembayaran", icon: CreditCard },
  { label: "Pengiriman", href: "/dasbor/pengaturan/pengiriman", icon: Truck, disabled: true },
  { label: "WhatsApp", href: "/dasbor/pengaturan/whatsapp", icon: MessageCircle },
];

export function PengaturanTabs() {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 overflow-x-auto border-b border-neutral-200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 whitespace-nowrap">
        {tabs.map(({ label, href, icon: Icon, disabled }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          if (disabled) {
            return (
              <li key={href}>
                <span
                  className="flex cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-neutral-400"
                  title="Akan segera hadir"
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </span>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
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
  );
}
