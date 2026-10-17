"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Camera, Crown } from "lucide-react";

import { cn } from "@/lib/utils";

/// Two kinds of money land in this page: SaaS subscriptions and PhotoBoost
/// sessions. They share a menu because they are both "what the platform
/// earned", but not a table — an invoice and a photo session have almost no
/// columns in common, and forcing them into one grid would leave half of
/// every row empty.
const TABS = [
  { id: "langganan", label: "Langganan", icon: Crown },
  { id: "photobooth", label: "Photo Booth", icon: Camera },
] as const;

export function AdminTransactionsTabs({ active }: { active: string }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id === "langganan") next.delete("tab");
    else next.set("tab", id);
    // Filters belong to the tab that set them, and page 1 is the only safe
    // page when the row set changes entirely.
    next.delete("page");
    next.delete("q");
    next.delete("status");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="mb-5 flex gap-2">
      {TABS.map(({ id, label, icon: Icon }) => {
        const on = id === active;
        return (
          <Link
            key={id}
            href={hrefFor(id)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              on
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
