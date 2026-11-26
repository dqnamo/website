import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
        pathname: "/10.x/initial-face/svg",
      },
      {
        protocol: "https",
        hostname: "saintdex.vercel.app",
        pathname: "/hero.jpeg",
      },
    ],
  },
  async redirects() {
    return [
      // Essays used to live under /writing; keep old links working.
      {
        source: "/writing/:slug",
        destination: "/essays/:slug",
        permanent: true,
      },
      // The lab used to be called the kitchen.
      {
        source: "/kitchen",
        destination: "/lab",
        permanent: true,
      },
      // Its pages and their images used to live under /experiments.
      {
        source: "/experiments/:path*",
        destination: "/lab/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
