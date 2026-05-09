import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Package,
  MessageCircle,
  MapPin,
  ExternalLink,
  Clock,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StorefrontCatalog } from "@/components/storefront/storefront-catalog";
import { waLink } from "@/lib/whatsapp";
import type { OpenHours, DayOfWeek } from "@/lib/types";

const apiBase =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

type StorefrontStore = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo_url: string;
  banner_url: string;
  tagline: string;
  category: string;
  city: string;
  whatsapp_number: string;
  instagram: string;
  tiktok: string;
  open_hours: OpenHours;
  is_open: boolean;
  theme_hue?: number;
  show_hours_public?: boolean;
  show_social_public?: boolean;
  footer_text?: string;
};

// Map an OKLCH hue (0-360) into the 11-shade brand palette as inline CSS
// custom properties. Used by the public toko page so each store can have
// its own brand color without a global theme rebuild.
function themeStyleForHue(hue: number | undefined): React.CSSProperties {
  const h = typeof hue === "number" && hue >= 0 && hue <= 360 ? hue : 145;
  return {
    "--color-brand-50": `oklch(0.97 0.025 ${h})`,
    "--color-brand-100": `oklch(0.94 0.06 ${h})`,
    "--color-brand-200": `oklch(0.88 0.11 ${h})`,
    "--color-brand-300": `oklch(0.81 0.15 ${h})`,
    "--color-brand-400": `oklch(0.76 0.17 ${h})`,
    "--color-brand-500": `oklch(0.71 0.18 ${h})`,
    "--color-brand-600": `oklch(0.61 0.17 ${h})`,
    "--color-brand-700": `oklch(0.51 0.15 ${h})`,
    "--color-brand-800": `oklch(0.41 0.12 ${h})`,
    "--color-brand-900": `oklch(0.31 0.09 ${h})`,
    "--color-brand-950": `oklch(0.21 0.06 ${h})`,
  } as React.CSSProperties;
}

type StorefrontProduct = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock: number;
  photo_urls: string[];
  is_featured: boolean;
};

type StorefrontCategory = { id: string; name: string };

type StorefrontData = {
  store: StorefrontStore;
  products: StorefrontProduct[];
  categories: StorefrontCategory[];
};

const dayLabels: Record<DayOfWeek, string> = {
  mon: "Senin",
  tue: "Selasa",
  wed: "Rabu",
  thu: "Kamis",
  fri: "Jumat",
  sat: "Sabtu",
  sun: "Minggu",
};
const dayOrder: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function todayKey(): DayOfWeek {
  // Day of week in WIB (UTC+7)
  const wibHour = (new Date().getUTCHours() + 7) % 24;
  const baseDay = new Date().getUTCDay(); // 0 = Sunday
  // If wibHour wrapped past midnight, day already advanced from UTC
  const wibDay =
    wibHour < new Date().getUTCHours() ? (baseDay + 1) % 7 : baseDay;
  // 0=Sun maps to "sun", 1=Mon to "mon", etc.
  const map: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[wibDay];
}

function isCurrentlyOpen(openHours: OpenHours): boolean | null {
  if (!openHours || Object.keys(openHours).length === 0) return null;
  const today = todayKey();
  const today_ = openHours[today];
  if (!today_ || today_.closed) return false;
  const now = new Date();
  const wibMinutes = ((now.getUTCHours() + 7) % 24) * 60 + now.getUTCMinutes();
  const [oh, om] = today_.open.split(":").map(Number);
  const [ch, cm] = today_.close.split(":").map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  return wibMinutes >= openMin && wibMinutes <= closeMin;
}

async function fetchStorefront(slug: string): Promise<StorefrontData | null> {
  try {
    const res = await fetch(`${apiBase}/api/v1/storefront/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as StorefrontData;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchStorefront(slug);
  if (!data) return { title: "Toko tidak ditemukan — SellOn" };
  return {
    title: `${data.store.name} — SellOn`,
    description:
      data.store.description || `Katalog ${data.store.name} di SellOn.`,
  };
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await fetchStorefront(slug);
  if (!data) notFound();
  const { store, products, categories = [] } = data;

  const todayHours = store.open_hours?.[todayKey()];
  const openNow = store.is_open && isCurrentlyOpen(store.open_hours) !== false;
  const showClosedBanner = !store.is_open || openNow === false;
  const showHours = store.show_hours_public !== false; // default true
  const showSocial = store.show_social_public !== false;

  return (
    <div
      className="min-h-svh bg-neutral-50"
      style={themeStyleForHue(store.theme_hue)}
    >
      {store.banner_url && (
        <div className="relative h-44 w-full overflow-hidden bg-neutral-100 sm:h-56 lg:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={store.banner_url}
            alt={`Banner ${store.name}`}
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0" />
          {store.tagline && (
            <Container>
              <p className="absolute inset-x-0 bottom-4 mx-auto max-w-3xl px-6 font-display text-lg font-medium text-white drop-shadow sm:bottom-6 sm:text-xl">
                {store.tagline}
              </p>
            </Container>
          )}
        </div>
      )}

      <header
        className={
          "border-b border-neutral-200 bg-white" +
          (store.banner_url ? "" : "")
        }
      >
        <Container>
          <div
            className={
              "flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:gap-6" +
              (store.banner_url ? " sm:-mt-10" : "")
            }
          >
            <Avatar
              src={store.logo_url}
              name={store.name}
              size="lg"
              className={
                "size-16 text-xl" +
                (store.banner_url
                  ? " ring-4 ring-white shadow-card"
                  : "")
              }
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                  {store.name}
                </h1>
                {!store.is_open ? (
                  <Badge variant="warning">Toko Tutup</Badge>
                ) : openNow ? (
                  <Badge variant="success">Buka Sekarang</Badge>
                ) : (
                  <Badge variant="warning">Tutup Sekarang</Badge>
                )}
              </div>
              {store.tagline && !store.banner_url && (
                <p className="mt-1 text-sm font-medium text-brand-700">
                  {store.tagline}
                </p>
              )}
              {store.description && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {store.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-600">
                {store.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden />
                    {store.city}
                  </span>
                )}
                {store.category && (
                  <span className="inline-flex items-center gap-1">
                    <Package className="size-3.5" aria-hidden />
                    {store.category}
                  </span>
                )}
                {showHours && todayHours && !todayHours.closed && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden />
                    Hari ini {todayHours.open} – {todayHours.close} WIB
                  </span>
                )}
                {showHours && todayHours?.closed && (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <Clock className="size-3.5" aria-hidden />
                    Tutup hari ini
                  </span>
                )}
                {store.whatsapp_number && (
                  <a
                    href={waLink(
                      store.whatsapp_number,
                      `Halo ${store.name}, saya mau tanya...`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-success hover:underline"
                  >
                    <MessageCircle className="size-3.5" aria-hidden />
                    Chat WhatsApp
                  </a>
                )}
                {showSocial && store.instagram && (
                  <a
                    href={`https://instagram.com/${store.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-neutral-900"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Instagram {store.instagram}
                  </a>
                )}
                {showSocial && store.tiktok && (
                  <a
                    href={`https://tiktok.com/@${store.tiktok.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-neutral-900"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    TikTok {store.tiktok}
                  </a>
                )}
              </div>

              {/* Full week hours collapsed */}
              {showHours && store.open_hours && Object.keys(store.open_hours).length > 0 && (
                <details className="mt-3 max-w-md text-xs text-neutral-600">
                  <summary className="cursor-pointer font-medium text-neutral-700 hover:text-neutral-900">
                    Lihat jadwal lengkap
                  </summary>
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    {dayOrder.map((d) => {
                      const h = store.open_hours[d];
                      return (
                        <li key={d} className="flex justify-between">
                          <span>{dayLabels[d]}</span>
                          <span className="font-mono">
                            {!h || h.closed
                              ? "Tutup"
                              : `${h.open}–${h.close}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </Container>
      </header>

      <main className="py-8 lg:py-12">
        <Container>
          {showClosedBanner && (
            <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
              <strong>
                {!store.is_open ? "Toko sedang tutup." : "Tutup di luar jam operasional."}
              </strong>{" "}
              Anda masih bisa lihat produk, tapi pesanan baru sementara tidak
              diterima.
            </div>
          )}

          <StorefrontCatalog
            storeSlug={slug}
            products={products}
            categories={categories}
          />
        </Container>
      </main>

      <footer className="border-t border-neutral-200 bg-white py-6">
        <Container>
          {store.footer_text && (
            <p className="mb-2 text-center text-sm text-neutral-700">
              {store.footer_text}
            </p>
          )}
          <p className="text-center text-xs text-neutral-500">
            Toko ini ditenagai oleh{" "}
            <Link
              href="/"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              SellOn
            </Link>
            . Bayar bulanan, tanpa potongan transaksi.
          </p>
        </Container>
      </footer>
    </div>
  );
}
