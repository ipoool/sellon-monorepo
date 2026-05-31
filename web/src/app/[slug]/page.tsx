import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
import { StoreHoursPopup } from "@/components/storefront/store-hours-popup";
import { waLink } from "@/lib/whatsapp";
import { themeStyleForHue } from "@/lib/storefront-theme";
import { pageMetadata } from "@/lib/seo";
import type { OpenHours, DayOfWeek, LayoutConfig } from "@/lib/types";

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
  accepting_orders?: boolean;
  accepting_orders_reason?: "" | "store_closed" | "order_limit";
  theme_hue?: number;
  product_layout?:
    | "grid"
    | "list"
    | "showcase"
    | "compact"
    | "magazine"
    | "feed";
  show_hours_public?: boolean;
  show_social_public?: boolean;
  footer_text?: string;
  layout_config?: LayoutConfig;
};

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
  product_type?: "physical" | "digital";
};

type StorefrontCategory = { id: string; name: string };

type StorefrontData = {
  store: StorefrontStore;
  products: StorefrontProduct[];
  categories: StorefrontCategory[];
};

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
  return pageMetadata({
    title: `${data.store.name} — SellOn`,
    description:
      data.store.description ||
      `Belanja produk ${data.store.name}${data.store.city ? ` di ${data.store.city}` : ""} — katalog & checkout via SellOn.`,
    path: `/${slug}`,
    image: data.store.banner_url || data.store.logo_url || undefined,
  });
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
  const orderLimitReached = store.accepting_orders_reason === "order_limit";
  const showHours = store.show_hours_public !== false; // default true
  const showSocial = store.show_social_public !== false;

  return (
    <div
      className="min-h-svh bg-neutral-50"
      style={themeStyleForHue(store.theme_hue)}
    >
      {store.banner_url && (
        <div className="relative h-44 w-full overflow-hidden bg-neutral-100 sm:h-56 lg:h-64">
          <Image
            src={store.banner_url}
            alt={`Banner ${store.name}`}
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
      )}

      <header className="border-b border-neutral-200 bg-white">
        <Container>
          <div className="flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:gap-6">
            <Avatar
              src={store.logo_url}
              name={store.name}
              size="lg"
              className={
                "size-20 text-2xl sm:size-24 sm:text-3xl" +
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
                ) : showHours ? (
                  openNow ? (
                    <Badge variant="success">Buka Sekarang</Badge>
                  ) : (
                    <Badge variant="warning">Tutup Sekarang</Badge>
                  )
                ) : null}
              </div>

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

              {/* Full week hours — opens as popup on click */}
              {showHours && store.open_hours && Object.keys(store.open_hours).length > 0 && (
                <StoreHoursPopup
                  openHours={store.open_hours}
                  storeName={store.name}
                />
              )}
            </div>
          </div>
        </Container>
      </header>

      <main className="py-8 lg:py-12">
        <Container>
          {orderLimitReached ? (
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800 sm:flex-row sm:items-center sm:justify-between">
              <p>
                <strong>
                  Penjual sementara tidak menerima pesanan baru.
                </strong>{" "}
                Untuk info lebih lanjut atau pemesanan khusus, silakan
                hubungi langsung admin toko.
              </p>
              {store.whatsapp_number && (
                <a
                  href={waLink(
                    store.whatsapp_number,
                    `Halo ${store.name}, saya mau tanya soal pemesanan.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Chat Admin Toko
                </a>
              )}
            </div>
          ) : showClosedBanner ? (
            <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
              <strong>
                {!store.is_open ? "Toko sedang tutup." : "Di luar jam operasional."}
              </strong>{" "}
              Pesanan tetap bisa kamu kirim — akan diproses saat toko buka
              kembali.
            </div>
          ) : null}

          <StorefrontCatalog
            storeSlug={slug}
            products={products}
            categories={categories}
            layout={store.product_layout ?? "grid"}
            layoutConfig={store.layout_config}
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
