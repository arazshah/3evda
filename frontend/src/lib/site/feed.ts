import type { Locale } from "@/i18n/config";
import { getSite } from "./api";
import { getArticles } from "./blog-api";
import { buildRss } from "./seo";

/** The RSS response for one language: the latest page of the journal. */
export async function rssResponse(locale: Locale): Promise<Response> {
  const [site, page] = await Promise.all([getSite(), getArticles(locale)]);
  return new Response(buildRss(site, locale, page.results), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
