import Link from "next/link";
import {
  ArrowRight,
  Check,
  Star,
  ShoppingBag,
  Cookie,
  Flame,
  Coffee,
  Cherry,
  Sparkles,
  Heart,
  Gift,
  BookOpen,
  Video,
  FileText,
  Headphones,
  Palette,
  Download,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { BrowserMockup } from "@/components/marketing/browser-mockup";

const heroPoints = [
  "Gratis selamanya untuk toko kecil",
  "Uang masuk langsung ke rekening kamu",
  "Setup 5 menit, tanpa kartu kredit",
];

type PresetProduct = {
  name: string;
  price: string;
  // Short metadata line under the price — varies per product type:
  // "Stok: 24" for physical, "Download instan" / "PDF · 120 hal" for digital.
  subline: string;
  icon: LucideIcon;
  // Tailwind classes for the photo placeholder's gradient + icon color.
  tint: string;
  // Optional small ribbon on the photo (Laris / Best Seller / dst).
  badge?: string;
};

type StorePreset = {
  slug: string;
  initials: string;
  name: string;
  tagline: string;
  products: [PresetProduct, PresetProduct, PresetProduct, PresetProduct];
  cartCount: number;
  cartTotal: string;
};

// A rotating gallery of mock storefronts that gets reshuffled on every
// SSR render. Mix of physical (food, fashion, F&B) and digital (course,
// creative templates) — surfaces product breadth and keeps the hero
// feeling alive on repeat visits. Add new presets here freely.
const STORE_PRESETS: StorePreset[] = [
  {
    slug: "bu-sari",
    initials: "BS",
    name: "Toko Bu Sari",
    tagline: "Keripik & sambel rumahan · Yogyakarta",
    cartCount: 2,
    cartTotal: "Rp 63.000",
    products: [
      {
        name: "Keripik Singkong Pedas",
        price: "Rp 35.000",
        subline: "Stok: 24",
        icon: Cookie,
        tint: "from-warning/15 to-warning/5 text-warning",
        badge: "Laris",
      },
      {
        name: "Sambel Bawang Premium",
        price: "Rp 28.000",
        subline: "Stok: 12",
        icon: Flame,
        tint: "from-danger/15 to-danger/5 text-danger",
      },
      {
        name: "Kopi Tubruk Robusta",
        price: "Rp 45.000",
        subline: "Stok: 38",
        icon: Coffee,
        tint: "from-neutral-200 to-neutral-100 text-neutral-700",
      },
      {
        name: "Manisan Mangga",
        price: "Rp 22.000",
        subline: "Stok: 17",
        icon: Cherry,
        tint: "from-brand-100 to-brand-50 text-brand-600",
      },
    ],
  },
  {
    slug: "hijab-lestari",
    initials: "HL",
    name: "Hijab Lestari",
    tagline: "Hijab voal & inner premium · Bandung",
    cartCount: 3,
    cartTotal: "Rp 132.000",
    products: [
      {
        name: "Pashmina Voal Plisket",
        price: "Rp 89.000",
        subline: "Stok: 56",
        icon: Sparkles,
        tint: "from-brand-100 to-brand-50 text-brand-600",
        badge: "Laris",
      },
      {
        name: "Inner Ninja Polos",
        price: "Rp 25.000",
        subline: "Stok: 120",
        icon: Heart,
        tint: "from-danger/15 to-danger/5 text-danger",
      },
      {
        name: "Bros Magnet Hijab",
        price: "Rp 18.000",
        subline: "Stok: 47",
        icon: Gift,
        tint: "from-warning/15 to-warning/5 text-warning",
      },
      {
        name: "Khimar Polos Premium",
        price: "Rp 145.000",
        subline: "Stok: 9",
        icon: Star,
        tint: "from-neutral-200 to-neutral-100 text-neutral-700",
      },
    ],
  },
  {
    slug: "kursus-sensei",
    initials: "KS",
    name: "Kursus Sensei",
    tagline: "Belajar bahasa Jepang dari nol · Online",
    cartCount: 1,
    cartTotal: "Rp 199.000",
    products: [
      {
        name: "Ebook Hiragana Lengkap",
        price: "Rp 35.000",
        subline: "PDF · 120 halaman",
        icon: BookOpen,
        tint: "from-brand-100 to-brand-50 text-brand-600",
        badge: "Best Seller",
      },
      {
        name: "Video Course Level N5",
        price: "Rp 199.000",
        subline: "12 modul · 6 jam",
        icon: Video,
        tint: "from-danger/15 to-danger/5 text-danger",
      },
      {
        name: "Flashcard Kanji Pack",
        price: "Rp 25.000",
        subline: "Download instan",
        icon: FileText,
        tint: "from-neutral-200 to-neutral-100 text-neutral-700",
      },
      {
        name: "Audio Listening N4",
        price: "Rp 49.000",
        subline: "MP3 · 3 jam",
        icon: Headphones,
        tint: "from-warning/15 to-warning/5 text-warning",
      },
    ],
  },
  {
    slug: "studio-cipta",
    initials: "SC",
    name: "Studio Cipta",
    tagline: "Preset Lightroom & template desain · Jakarta",
    cartCount: 2,
    cartTotal: "Rp 124.000",
    products: [
      {
        name: "Preset Wedding Cinematic",
        price: "Rp 75.000",
        subline: "Lightroom DNG",
        icon: Palette,
        tint: "from-brand-100 to-brand-50 text-brand-600",
        badge: "Best Seller",
      },
      {
        name: "Template Logo Bundle",
        price: "Rp 99.000",
        subline: "20 file vector",
        icon: FileText,
        tint: "from-neutral-200 to-neutral-100 text-neutral-700",
      },
      {
        name: "Mockup Pack Apparel",
        price: "Rp 49.000",
        subline: "12 PSD files",
        icon: Download,
        tint: "from-danger/15 to-danger/5 text-danger",
      },
      {
        name: "Pack Wallpaper HD",
        price: "Rp 19.000",
        subline: "100 file · ZIP",
        icon: BookOpen,
        tint: "from-warning/15 to-warning/5 text-warning",
      },
    ],
  },
  {
    slug: "kedai-anya",
    initials: "KA",
    name: "Kedai Anya",
    tagline: "Specialty coffee Indonesia · Surabaya",
    cartCount: 1,
    cartTotal: "Rp 95.000",
    products: [
      {
        name: "Arabica Toraja 250g",
        price: "Rp 95.000",
        subline: "Stok: 28",
        icon: Coffee,
        tint: "from-warning/15 to-warning/5 text-warning",
        badge: "Best",
      },
      {
        name: "Robusta Lampung 250g",
        price: "Rp 65.000",
        subline: "Stok: 42",
        icon: Coffee,
        tint: "from-neutral-200 to-neutral-100 text-neutral-700",
      },
      {
        name: "Drip Bag Coffee Pack",
        price: "Rp 45.000",
        subline: "Isi 10 sachet",
        icon: Gift,
        tint: "from-danger/15 to-danger/5 text-danger",
      },
      {
        name: "V60 Pour Over Kit",
        price: "Rp 185.000",
        subline: "Stok: 6",
        icon: Cherry,
        tint: "from-brand-100 to-brand-50 text-brand-600",
      },
    ],
  },
];

// Picked on every server render — getMe()/serverApi calls already make
// the landing page dynamic, so this rotates between presets on each
// refresh without any client-side flicker.
function pickRandomPreset(): StorePreset {
  return STORE_PRESETS[Math.floor(Math.random() * STORE_PRESETS.length)];
}

export function Hero() {
  const preset = pickRandomPreset();
  return (
    <section className="relative overflow-hidden pb-16 pt-14 lg:pb-24 lg:pt-20">
      <div
        aria-hidden
        className="bg-dot-grid pointer-events-none absolute inset-x-0 bottom-0 top-0 -z-10 opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent_80%)]"
      />

      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <Badge variant="brand">Untuk seller WhatsApp Indonesia</Badge>
            <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              Jualan WhatsApp,{" "}
              <span className="text-gradient-brand">tanpa balas chat</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
              Pembeli pilih dan bayar sendiri dari link katalog-mu. <br />
              Setup 5 menit, tanpa potongan marketplace.
            </p>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Link href="/login">
                <Button size="lg">
                  Mulai Gratis
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <Link href="/#cara-kerja">
                <Button size="lg" variant="ghost">
                  Lihat cara kerja →
                </Button>
              </Link>
            </div>

            <ul className="mt-8 flex flex-col gap-2 text-sm text-neutral-600 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
              {heroPoints.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="size-4 text-brand-600" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-6">
            <BrowserMockup
              url={`sellon.id/${preset.slug}`}
              className="lg:ml-auto"
            >
              <StorefrontPreview preset={preset} />
            </BrowserMockup>
          </div>
        </div>
      </Container>
    </section>
  );
}

// Stylized miniature of the public storefront (the link buyers see) for
// the hero mockup. Pure HTML/CSS — no real images. Driven by a preset
// passed from <Hero/>, which gets reshuffled on every SSR render so
// repeat visits see a different toko (mix of physical + digital).
function StorefrontPreview({ preset }: { preset: StorePreset }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Store header — what buyer sees when landing on the catalog */}
      <div className="flex items-center gap-2.5 border-b border-neutral-200 pb-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white shadow-soft">
          {preset.initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold text-neutral-900">
            {preset.name}
          </p>
          <p className="truncate text-[10px] text-neutral-500">
            {preset.tagline}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          Buka
        </span>
      </div>

      {/* Product grid — the actual catalog */}
      <div className="grid grid-cols-2 gap-2">
        {preset.products.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.name}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
            >
              <div
                className={`relative flex aspect-[5/4] items-center justify-center bg-gradient-to-br ${p.tint}`}
              >
                <Icon className="size-7" strokeWidth={1.75} aria-hidden />
                {p.badge && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-warning/95 px-1.5 py-0.5 text-[8px] font-semibold text-white shadow-soft">
                    <Star className="size-2 fill-current" aria-hidden />
                    {p.badge}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-[11px] font-medium text-neutral-900">
                  {p.name}
                </p>
                <p className="mt-0.5 font-display text-[11px] font-bold text-neutral-900">
                  {p.price}
                </p>
                <p className="mt-0.5 text-[9px] text-neutral-500">
                  {p.subline}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart / Beli CTA — the moment of conversion the H1 promises:
          "pembeli pilih dan bayar sendiri" */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-full bg-brand-600 text-white">
            <ShoppingBag className="size-3" aria-hidden />
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-brand-700">
              {preset.cartCount} item
            </p>
            <p className="font-display text-xs font-bold text-neutral-900">
              {preset.cartTotal}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-soft">
          Beli sekarang
          <ArrowRight className="size-3" aria-hidden />
        </span>
      </div>
    </div>
  );
}
