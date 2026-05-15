import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { helpArticles } from "@/lib/help-articles";
import { articles as guideArticles } from "@/lib/guides-articles";

const lastModified = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly" as const, priority: 1.0 },
    {
      url: `${SITE_URL}/about`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/roadmap`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/help`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guides`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/cookies`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ].map((r) => ({ ...r, lastModified }));

  const helpRoutes: MetadataRoute.Sitemap = helpArticles.map((a) => ({
    url: `${SITE_URL}/help/${a.slug}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const guideRoutes: MetadataRoute.Sitemap = guideArticles.map((a) => ({
    url: `${SITE_URL}/guides/${a.slug}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...helpRoutes, ...guideRoutes];
}
