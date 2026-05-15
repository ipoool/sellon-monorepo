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
};

export default nextConfig;
