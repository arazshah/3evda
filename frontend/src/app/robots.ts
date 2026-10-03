import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteOrigin } from "@/lib/site/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // PUBLIC_URL exists only at run time (not while the image is built), so this must not be prerendered.
  await connection();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/panel", "/api/", "/django-admin/", "/p/", "/en/p/"] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
