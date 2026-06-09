import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // We serve user-uploaded photos from arbitrary domains (Google profile
    // CDN, our own API uploads). Skip the optimization pipeline rather than
    // maintain a remotePatterns allow-list — the originals are already
    // size-bounded server-side.
    unoptimized: true,
  },
  // Unconditional route aliases. Handled at the routing layer (checked before
  // the filesystem) so no component renders — this also avoids the dev-only
  // React profiler "negative time stamp" measure error that fires when a Server
  // Component throws redirect() at the very start of render. Conditional
  // redirects (auth/store guards) stay as redirect() inside their pages.
  async redirects() {
    return [
      // /settings has no overview page yet — land on the first tab.
      { source: "/settings", destination: "/settings/store", permanent: false },
      // Laporan + Analytics were merged into /analytics; keep old links working.
      // (Exact match — the sub-route /reports/materials is unaffected.)
      { source: "/reports", destination: "/analytics", permanent: true },
    ];
  },
};

export default nextConfig;
