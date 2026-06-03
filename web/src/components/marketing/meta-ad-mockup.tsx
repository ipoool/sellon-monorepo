"use client";

import { useSyncExternalStore } from "react";
import {
  RefreshCcw,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ArrowRight,
  BadgeCheck,
  Coffee,
  Shirt,
  Sparkles,
  Croissant,
  Smartphone,
  Flower2,
  Footprints,
  Gem,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

// The mockup depicts a Facebook/Instagram sponsored post, so it intentionally
// uses Meta's brand colours (FB blue #1877F2, the IG gradient) rather than
// SellOn theme tokens — re-skinning the brand hue shouldn't change what a
// "Facebook ad" looks like.
const IG_GRADIENT =
  "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)";

type AdVariant = {
  handle: string;
  initials: string;
  product: string;
  price: string;
  icon: LucideIcon;
  stats: { pembelian: string; roas: string; biaya: string };
};

// A spread of Indonesian UMKM business types so a refresh shows a fresh "ad".
const VARIANTS: AdVariant[] = [
  {
    handle: "kopikenangan.id",
    initials: "KK",
    product: "Kopi Susu Gula Aren",
    price: "Rp 18.000",
    icon: Coffee,
    stats: { pembelian: "142", roas: "6,2×", biaya: "Rp 8.500" },
  },
  {
    handle: "threadlabel.co",
    initials: "TL",
    product: "Kemeja Linen Pria",
    price: "Rp 189.000",
    icon: Shirt,
    stats: { pembelian: "318", roas: "5,4×", biaya: "Rp 21.000" },
  },
  {
    handle: "glow.daily",
    initials: "GD",
    product: "Serum Vitamin C 20ml",
    price: "Rp 95.000",
    icon: Sparkles,
    stats: { pembelian: "526", roas: "7,1×", biaya: "Rp 14.300" },
  },
  {
    handle: "bakedby.nina",
    initials: "BN",
    product: "Croissant Butter Premium",
    price: "Rp 28.000",
    icon: Croissant,
    stats: { pembelian: "204", roas: "4,8×", biaya: "Rp 11.200" },
  },
  {
    handle: "gearspace.id",
    initials: "GS",
    product: "Case MagSafe iPhone",
    price: "Rp 79.000",
    icon: Smartphone,
    stats: { pembelian: "467", roas: "6,9×", biaya: "Rp 17.500" },
  },
  {
    handle: "mekar.bloom",
    initials: "MB",
    product: "Buket Bunga Fresh",
    price: "Rp 150.000",
    icon: Flower2,
    stats: { pembelian: "98", roas: "5,1×", biaya: "Rp 24.000" },
  },
  {
    handle: "langkah.store",
    initials: "LS",
    product: "Sneakers Kanvas Putih",
    price: "Rp 249.000",
    icon: Footprints,
    stats: { pembelian: "276", roas: "5,8×", biaya: "Rp 19.800" },
  },
  {
    handle: "tokoperhiasan",
    initials: "TP",
    product: "Kalung Rantai Silver",
    price: "Rp 120.000",
    icon: Gem,
    stats: { pembelian: "163", roas: "6,4×", biaya: "Rp 15.600" },
  },
];

// Pick a random variant once per page load. The module re-initialises on a
// full refresh, so every refresh shows a fresh "ad"; the pick is memoised so
// re-renders within a session don't reshuffle the card.
let pickedIndex: number | null = null;
function clientIndex(): number {
  if (pickedIndex === null) {
    pickedIndex = Math.floor(Math.random() * VARIANTS.length);
  }
  return pickedIndex;
}
const subscribe = () => () => {};

export function MetaAdMockup() {
  // useSyncExternalStore renders the server snapshot (variant 0) during SSR +
  // hydration, then swaps to the client snapshot (random) — without a
  // hydration-mismatch warning, and without setState-in-effect.
  const idx = useSyncExternalStore(subscribe, clientIndex, () => 0);

  const v = VARIANTS[idx];
  const Icon = v.icon;

  return (
    <div className="relative">
      {/* Floating "Pixel aktif" tag */}
      <div className="pointer-events-none absolute -left-4 top-6 z-20 hidden rotate-[-4deg] items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-elevated sm:inline-flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        Pixel aktif
      </div>
      {/* Floating "Katalog tersinkron" tag */}
      <div className="pointer-events-none absolute -right-3 top-1/2 z-20 hidden rotate-[3deg] items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-elevated sm:inline-flex">
        <RefreshCcw className="size-3" aria-hidden />
        Katalog tersinkron
      </div>

      {/* key={idx} re-mounts the card so the swap fades in smoothly */}
      <div
        key={idx}
        className="mx-auto max-w-sm animate-[fadeIn_240ms_ease-out] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-popout"
      >
        {/* Post header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span
            className="flex size-9 items-center justify-center rounded-full p-[2px]"
            style={{ background: IG_GRADIENT }}
          >
            <span className="flex size-full items-center justify-center rounded-full bg-white text-xs font-bold text-neutral-700">
              {v.initials}
            </span>
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex items-center gap-1 text-sm font-semibold text-neutral-900">
              {v.handle}
              <BadgeCheck className="size-3.5 text-[#1877F2]" aria-hidden />
            </p>
            <p className="text-[11px] text-neutral-500">Bersponsor</p>
          </div>
          <MoreHorizontal className="size-4 text-neutral-400" aria-hidden />
        </div>

        {/* Media */}
        <div className="relative flex aspect-square items-center justify-center bg-gradient-brand-soft">
          <Icon className="size-16 text-brand-600/70" aria-hidden />
          <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 backdrop-blur">
            <p className="text-xs font-semibold text-neutral-900">{v.product}</p>
            <p className="text-[11px] font-medium text-brand-700">{v.price}</p>
          </div>
        </div>

        {/* "Belanja Sekarang" CTA bar (Facebook blue) */}
        <Link
          href="/login"
          className="flex items-center justify-between px-3 py-2.5 text-white"
          style={{ backgroundColor: "#1877F2" }}
        >
          <span className="text-sm font-semibold">Belanja Sekarang</span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>

        {/* Action row */}
        <div className="flex items-center gap-4 px-3 py-2.5 text-neutral-700">
          <Heart className="size-5" aria-hidden />
          <MessageCircle className="size-5" aria-hidden />
          <Send className="size-5" aria-hidden />
          <Bookmark className="ml-auto size-5" aria-hidden />
        </div>

        {/* Stats strip — conveys measurability */}
        <div className="grid grid-cols-3 divide-x divide-neutral-100 border-t border-neutral-100 bg-neutral-50/70 text-center">
          {[
            { v: v.stats.pembelian, l: "Pembelian" },
            { v: v.stats.roas, l: "ROAS" },
            { v: v.stats.biaya, l: "Biaya/order" },
          ].map((s) => (
            <div key={s.l} className="px-2 py-2.5">
              <p className="text-sm font-bold text-neutral-900">{s.v}</p>
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                {s.l}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
