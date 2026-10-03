import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/site/blog-api";
import { buildSitemap } from "@/lib/site/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(await getSitemapData());
}
