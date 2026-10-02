import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Persian is served without a prefix (/about), English under /en (/en/about).
// Internally every page lives under app/[locale]; these rules map the public URLs onto it.
// Paths with a file extension (favicon.svg, robots.txt, …) are public files and are not rewritten.
const UNPREFIXED =
  "/:path((?!en(?:/|$)|fa(?:/|$)|api/|django-admin/|static/|media/|health$|_next/|.*\\.[^/]+$).*)";

// `next dev` only: forward API/media requests to the compose gateway (production routes them in Caddy).
const DEV_GATEWAY = process.env.DEV_GATEWAY_URL ?? "http://localhost:8080";
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // DRF URLs end with "/"; Next must not strip it while proxying in development.
  skipTrailingSlashRedirect: isDev,
  async redirects() {
    return [
      { source: "/fa", destination: "/", permanent: true },
      { source: "/fa/:path*", destination: "/:path*", permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/fa" },
        { source: UNPREFIXED, destination: "/fa/:path" },
      ],
      afterFiles: isDev
        ? ["api", "media", "storage-signed", "static", "django-admin"].map((prefix) => ({
            source: `/${prefix}/:path*`,
            destination: `${DEV_GATEWAY}/${prefix}/:path*`,
          }))
        : [],
      fallback: [],
    };
  },
};

export default withNextIntl(nextConfig);
