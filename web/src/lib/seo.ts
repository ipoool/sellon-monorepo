import type { Metadata } from "next";

// Resolution order: explicit env override → production canonical. Used for
// metadataBase, sitemap, robots, OG / canonical URLs. Override with
// NEXT_PUBLIC_SITE_URL when running on a preview / staging origin.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://sellon.id";

// Brand identity reused across structured data + OG defaults.
export const BRAND = {
  name: "SellOn",
  legalName: "SellOn Indonesia",
  logo: `${SITE_URL}/logo.png`,
  twitter: "@sellon_id",
  locale: "id_ID",
  description:
    "Toko online untuk seller WhatsApp Indonesia. Bikin katalog, terima order lewat link, pembayaran QRIS/Midtrans, dan konfirmasi via WhatsApp - tanpa potongan marketplace.",
} as const;

// Builds a canonical URL for a path (must start with "/"). Idempotent —
// passing a full URL returns it unchanged so callers can pass either.
export function canonical(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean === "/" ? "" : clean}`;
}

type SeoInput = {
  title: string;
  description: string;
  /** Path beginning with "/", used for canonical + og:url. */
  path: string;
  /** Override the default OG type. Default "website". */
  ogType?: "website" | "article";
  /** ISO date for og:article:published_time. Only used when ogType="article". */
  publishedTime?: string;
  /** "noindex" pages (status page, internal pages, etc.). */
  noindex?: boolean;
  /** Optional explicit OG image. Falls back to /og-default.png. */
  image?: string;
};

// pageMetadata builds a Next.js Metadata object with sane SEO defaults
// already filled in (canonical, OG, Twitter, robots). Pages just declare
// title/description/path; the rest is derived consistently.
export function pageMetadata(input: SeoInput): Metadata {
  const url = canonical(input.path);
  const image = input.image ?? `${SITE_URL}/og-default.png`;
  const meta: Metadata = {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: input.ogType ?? "website",
      url,
      title: input.title,
      description: input.description,
      siteName: BRAND.name,
      locale: BRAND.locale,
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
      site: BRAND.twitter,
    },
  };
  if (input.noindex) {
    meta.robots = { index: false, follow: false };
  }
  if (input.ogType === "article" && input.publishedTime) {
    (meta.openGraph as Record<string, unknown>).publishedTime =
      input.publishedTime;
  }
  return meta;
}

// JSON-LD generators — render the returned object inside a
// <script type="application/ld+json"> in the page.

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.legalName,
    url: SITE_URL,
    logo: BRAND.logo,
    description: BRAND.description,
    sameAs: [
      "https://www.instagram.com/sellon.id",
      "https://twitter.com/sellon_id",
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND.name,
    url: SITE_URL,
    inLanguage: "id-ID",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/help?q={query}`,
      "query-input": "required name=query",
    },
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: canonical(it.path),
    })),
  };
}

export function articleJsonLd(input: {
  title: string;
  description: string;
  path: string;
  authorName?: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
}) {
  const url = canonical(input.path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: input.image ? [input.image] : [`${SITE_URL}/og-default.png`],
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: {
      "@type": "Organization",
      name: input.authorName ?? BRAND.name,
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.legalName,
      logo: { "@type": "ImageObject", url: BRAND.logo },
    },
  };
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}
