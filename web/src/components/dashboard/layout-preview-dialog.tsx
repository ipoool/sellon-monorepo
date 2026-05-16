"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Monitor,
  Smartphone,
  Check,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  Star,
  LayoutDashboard,
  LayoutPanelTop,
  Rows3,
  MonitorSmartphone,
  BookOpen,
  RectangleVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StorefrontCatalog,
  type ProductLayout,
} from "@/components/storefront/storefront-catalog";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const LAYOUTS: Array<{
  key: ProductLayout;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { key: "grid", label: "Grid", icon: LayoutGrid },
  { key: "list", label: "Daftar", icon: ListIcon },
  { key: "showcase", label: "Sorotan", icon: Star },
  { key: "compact", label: "Padat", icon: LayoutDashboard },
  { key: "magazine", label: "Majalah", icon: LayoutPanelTop },
  { key: "feed", label: "Feed", icon: Rows3 },
  { key: "kiosk", label: "Kiosk", icon: MonitorSmartphone },
  { key: "katalog", label: "Katalog", icon: BookOpen },
  { key: "poster", label: "Poster", icon: RectangleVertical },
];

type DeviceFrame = "desktop" | "mobile";

type StorefrontProductPreview = {
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

type StorefrontHeaderPreview = {
  name: string;
  tagline?: string;
  description?: string;
  logo_url?: string;
  banner_url?: string;
  city?: string;
};

type Props = {
  storeSlug: string;
  // Layout yang sedang di-preview (boleh beda dari yang ter-save).
  initialLayout: ProductLayout;
  // Layout yang sedang ter-save di state form parent — dipakai untuk
  // tampilkan badge "Saat ini" di tab layout aktif.
  currentLayout: ProductLayout;
  onClose: () => void;
  onApply: (key: ProductLayout) => void;
};

export function LayoutPreviewDialog({
  storeSlug,
  initialLayout,
  currentLayout,
  onClose,
  onApply,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [previewLayout, setPreviewLayout] =
    useState<ProductLayout>(initialLayout);
  const [device, setDevice] = useState<DeviceFrame>("desktop");
  const [products, setProducts] = useState<StorefrontProductPreview[]>([]);
  const [storeHeader, setStoreHeader] = useState<StorefrontHeaderPreview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // Open dialog via native showModal.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", cancel);
    return () => d.removeEventListener("cancel", cancel);
  }, [onClose]);

  // Fetch storefront produk asli untuk preview yang realistic.
  // Endpoint /api/v1/storefront/:slug public — tidak perlu auth.
  useEffect(() => {
    let aborted = false;
    setLoading(true);
    fetch(`${apiBase}/api/v1/storefront/${storeSlug}`)
      .then((r) => r.json())
      .then(
        (data: {
          products?: StorefrontProductPreview[];
          store?: StorefrontHeaderPreview;
        }) => {
          if (aborted) return;
          setProducts(data.products ?? []);
          if (data.store) setStoreHeader(data.store);
        },
      )
      .catch((err) => {
        if (!aborted) showError(err);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [storeSlug]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="layout-preview-title"
      // Full-screen — fix top-left + w/h 100vw/100svh. Browser <dialog>
      // backdrop diatur ::backdrop di Tailwind utilities.
      className="fixed inset-0 m-0 h-svh max-h-none w-screen max-w-none border-0 bg-neutral-50 p-0 backdrop:bg-neutral-900/60"
    >
      {/* Top bar */}
      <div className="flex h-14 items-center gap-2 border-b border-neutral-200 bg-white px-3 sm:gap-4 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup preview"
          className="-ml-1 flex size-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="size-5" aria-hidden />
        </button>

        <h2
          id="layout-preview-title"
          className="font-display text-sm font-semibold text-neutral-900 sm:text-base"
        >
          Preview Layout
        </h2>

        {/* Layout switcher tabs */}
        <div className="ml-2 flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          {LAYOUTS.map((l) => {
            const Icon = l.icon;
            const isActive = previewLayout === l.key;
            const isCurrent = currentLayout === l.key;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => setPreviewLayout(l.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:text-sm",
                  isActive
                    ? "bg-white text-brand-700 shadow-soft"
                    : "text-neutral-600 hover:text-neutral-900",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{l.label}</span>
                {isCurrent && !isActive && (
                  <Badge variant="outline" className="text-[10px]">
                    Saat ini
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Device toggle */}
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            aria-label="Tampilan desktop"
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              device === "desktop"
                ? "bg-white text-brand-700 shadow-soft"
                : "text-neutral-500 hover:text-neutral-900",
            )}
          >
            <Monitor className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            aria-label="Tampilan mobile"
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              device === "mobile"
                ? "bg-white text-brand-700 shadow-soft"
                : "text-neutral-500 hover:text-neutral-900",
            )}
          >
            <Smartphone className="size-4" aria-hidden />
          </button>
        </div>

        {/* Apply button */}
        <Button
          type="button"
          size="sm"
          onClick={() => onApply(previewLayout)}
          disabled={previewLayout === currentLayout}
        >
          <Check className="size-3.5" aria-hidden />
          Terapkan
        </Button>
      </div>

      {/* Preview viewport */}
      <div className="flex h-[calc(100svh-3.5rem)] items-start justify-center overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-20 text-sm text-neutral-500">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            Memuat produk untuk preview…
          </div>
        ) : products.length === 0 ? (
          <p className="py-20 text-sm text-neutral-500">
            Belum ada produk untuk di-preview. Tambah produk dulu di menu
            Produk.
          </p>
        ) : (
          <div
            className={cn(
              "w-full transition-all duration-200",
              device === "mobile"
                ? "max-w-sm overflow-hidden rounded-2xl border-[10px] border-neutral-900 bg-white shadow-popout"
                : "max-w-6xl",
            )}
          >
            {/* Header preview — meniru tampilan banner + logo + nama
                + tagline yang real pembeli lihat di storefront. */}
            {storeHeader && (
              <StoreHeaderPreview
                store={storeHeader}
                forceMobile={device === "mobile"}
              />
            )}

            <div className={cn(device === "mobile" ? "p-3" : "p-0 pt-4")}>
              <StorefrontCatalog
                storeSlug={storeSlug}
                products={products}
                categories={[]}
                layout={previewLayout}
                forceMobile={device === "mobile"}
              />
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

// StoreHeaderPreview — versi compact dari header storefront (lihat
// src/app/[slug]/page.tsx). Tujuannya cuma kontekstual: kasih tahu
// seller "begini lho gambaran banner + nama + tagline kamu di atas
// list produk". forceMobile menyusut padding + ukuran font biar pas
// di dalam frame max-w-sm.
function StoreHeaderPreview({
  store,
  forceMobile,
}: {
  store: StorefrontHeaderPreview;
  forceMobile: boolean;
}) {
  const initials =
    store.name
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <div
      className={cn(
        "overflow-hidden",
        forceMobile ? "" : "rounded-t-xl",
        !forceMobile && "border-b border-neutral-200",
      )}
    >
      {store.banner_url && (
        <div
          className={cn(
            "relative w-full overflow-hidden bg-neutral-100",
            forceMobile ? "h-20" : "h-40",
          )}
        >
          <img
            src={store.banner_url}
            alt={`Banner ${store.name}`}
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0" />
          {store.tagline && (
            <p
              className={cn(
                "absolute inset-x-0 bottom-2 px-3 font-medium text-white drop-shadow",
                forceMobile ? "text-[11px]" : "text-base sm:text-lg",
              )}
            >
              {store.tagline}
            </p>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex items-start gap-3 bg-white",
          forceMobile ? "px-3 py-3" : "px-5 py-4",
          store.banner_url && !forceMobile && "-mt-5",
        )}
      >
        {store.logo_url ? (
          <img
            src={store.logo_url}
            alt={store.name}
            className={cn(
              "shrink-0 rounded-full object-cover ring-2 ring-white",
              forceMobile ? "size-10" : "size-14",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-2 ring-white",
              forceMobile ? "size-10 text-xs" : "size-14 text-base",
            )}
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-display font-semibold leading-tight text-neutral-900",
              forceMobile ? "text-sm" : "text-xl",
            )}
          >
            {store.name}
          </p>
          {store.tagline && !store.banner_url && (
            <p
              className={cn(
                "mt-0.5 font-medium text-brand-700",
                forceMobile ? "text-[11px]" : "text-sm",
              )}
            >
              {store.tagline}
            </p>
          )}
          {store.description && (
            <p
              className={cn(
                "mt-1 line-clamp-2 leading-snug text-neutral-600",
                forceMobile ? "text-[11px]" : "text-sm",
              )}
            >
              {store.description}
            </p>
          )}
          {store.city && (
            <p
              className={cn(
                "mt-1 text-neutral-500",
                forceMobile ? "text-[10px]" : "text-xs",
              )}
            >
              {store.city}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
