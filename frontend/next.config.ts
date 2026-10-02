import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Persian is served without a prefix (/about), English under /en (/en/about).
// Internally every page lives under app/[locale]; these rules map the public URLs onto it.
const UNPREFIXED = "/:path((?!en(?:/|$)|fa(?:/|$)|api/|django-admin/|static/|media/|health$|_next/).*)";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
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
      afterFiles: [],
      fallback: [],
    };
  },
};

export default withNextIntl(nextConfig);
