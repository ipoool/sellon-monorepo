// "Landing" storefront template: a Shopify-style home page assembled from
// ordered sections — hero slider, product rows, full-width banners, text —
// instead of a single catalog grid. Modelled on the structure of stores like
// apelicious.com: announcement bar → slider → "Best seller" row → promo
// banner → more product rows.
//
// Stored under stores.layout_config.landing (raw JSONB the API never
// inspects, same contract the kiosk config uses), so everything here has to
// tolerate missing, stale or hand-edited data: `normalizeLandingConfig` is
// the single gate both the editor and the public renderer read through.
//
// Colour is deliberately NOT part of this config — the store already has
// `theme_hue`, and a second colour control would just drift from it. The
// template adds a `background` treatment on top of that one hue.

export type LandingBackground = "white" | "soft" | "tinted" | "dark";

export type LandingSlide = {
  image_url: string;
  link_url?: string;
};

export type LandingProductSource = "featured" | "newest" | "all" | "category";

export type LandingSection =
  | {
      id: string;
      type: "slider";
      slides: LandingSlide[];
      // Autoplay interval; 0 disables.
      autoplay_ms?: number;
    }
  | {
      id: string;
      type: "products";
      title: string;
      source: LandingProductSource;
      // Only read when source === "category".
      category_id?: string;
      // 0 = no limit.
      limit: number;
      columns: 3 | 4 | 6;
    }
  | {
      id: string;
      type: "banner";
      image_url: string;
      link_url?: string;
    }
  | {
      id: string;
      type: "text";
      title: string;
      body: string;
      align: "left" | "center";
    };

export type LandingSectionType = LandingSection["type"];

export type LandingConfig = {
  announcement: {
    enabled: boolean;
    text: string;
    link_url?: string;
  };
  background: LandingBackground;
  sections: LandingSection[];
};

export const MAX_LANDING_SECTIONS = 12;
export const MAX_SLIDES_PER_SLIDER = 8;

export function newSectionId(): string {
  // Not a security identifier — only has to be unique within one config so
  // React keys and reorder operations are stable.
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

// What a seller sees the first time they pick this template: a working home
// page with nothing to fill in, so switching layouts never produces a blank
// store. The empty slider renders nothing until a slide is added.
export function defaultLandingConfig(): LandingConfig {
  return {
    announcement: { enabled: false, text: "", link_url: "" },
    background: "white",
    sections: [
      { id: newSectionId(), type: "slider", slides: [], autoplay_ms: 5000 },
      {
        id: newSectionId(),
        type: "products",
        title: "Produk Unggulan",
        source: "featured",
        limit: 8,
        columns: 4,
      },
      {
        id: newSectionId(),
        type: "products",
        title: "Produk Terbaru",
        source: "newest",
        limit: 8,
        columns: 4,
      },
      {
        id: newSectionId(),
        type: "products",
        title: "Semua Produk",
        source: "all",
        limit: 0,
        columns: 4,
      },
    ],
  };
}

export function blankSection(type: LandingSectionType): LandingSection {
  const id = newSectionId();
  switch (type) {
    case "slider":
      return { id, type, slides: [], autoplay_ms: 5000 };
    case "products":
      return { id, type, title: "Produk", source: "all", limit: 8, columns: 4 };
    case "banner":
      return { id, type, image_url: "", link_url: "" };
    case "text":
      return { id, type, title: "", body: "", align: "center" };
  }
}

const BACKGROUNDS: LandingBackground[] = ["white", "soft", "tinted", "dark"];
const SOURCES: LandingProductSource[] = ["featured", "newest", "all", "category"];

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

// Coerces whatever is stored into a config the renderer can trust. Unknown
// section types are dropped rather than crashing the public page; every field
// is clamped. Returns the defaults when there is nothing usable, which is
// also what a seller gets before they have configured anything.
export function normalizeLandingConfig(raw: unknown): LandingConfig {
  if (!raw || typeof raw !== "object") return defaultLandingConfig();
  const r = raw as Record<string, unknown>;

  const annRaw = (r.announcement ?? {}) as Record<string, unknown>;
  const announcement = {
    enabled: annRaw.enabled === true,
    text: str(annRaw.text, 160),
    link_url: str(annRaw.link_url, 500),
  };

  const background = BACKGROUNDS.includes(r.background as LandingBackground)
    ? (r.background as LandingBackground)
    : "white";

  const sections: LandingSection[] = [];
  if (Array.isArray(r.sections)) {
    for (const s of r.sections.slice(0, MAX_LANDING_SECTIONS)) {
      if (!s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      const id = str(o.id, 32) || newSectionId();
      switch (o.type) {
        case "slider": {
          const slides = Array.isArray(o.slides)
            ? o.slides
                .slice(0, MAX_SLIDES_PER_SLIDER)
                .map((sl) => {
                  const x = (sl ?? {}) as Record<string, unknown>;
                  return { image_url: str(x.image_url), link_url: str(x.link_url) };
                })
            : [];
          sections.push({
            id,
            type: "slider",
            slides,
            autoplay_ms: num(o.autoplay_ms, 5000, 0, 60000),
          });
          break;
        }
        case "products": {
          const source = SOURCES.includes(o.source as LandingProductSource)
            ? (o.source as LandingProductSource)
            : "all";
          const cols = num(o.columns, 4, 3, 6);
          sections.push({
            id,
            type: "products",
            title: str(o.title, 80),
            source,
            category_id: str(o.category_id, 64),
            limit: num(o.limit, 8, 0, 48),
            columns: cols === 6 ? 6 : cols === 3 ? 3 : 4,
          });
          break;
        }
        case "banner":
          sections.push({
            id,
            type: "banner",
            image_url: str(o.image_url),
            link_url: str(o.link_url),
          });
          break;
        case "text":
          sections.push({
            id,
            type: "text",
            title: str(o.title, 120),
            body: str(o.body, 2000),
            align: o.align === "left" ? "left" : "center",
          });
          break;
        default:
          // Unknown type: drop it. Better a missing section than a dead page.
          break;
      }
    }
  }

  if (sections.length === 0) {
    return { ...defaultLandingConfig(), announcement, background };
  }
  return { announcement, background, sections };
}

// Every image URL referenced by a config. The settings form diffs this
// against what was last saved so removed slides/banners are deleted from
// object storage instead of orphaned — the same cleanup kiosk slides get.
export function landingImageUrls(cfg: LandingConfig): string[] {
  const out: string[] = [];
  for (const s of cfg.sections) {
    if (s.type === "slider") for (const sl of s.slides) if (sl.image_url) out.push(sl.image_url);
    if (s.type === "banner" && s.image_url) out.push(s.image_url);
  }
  return out;
}
