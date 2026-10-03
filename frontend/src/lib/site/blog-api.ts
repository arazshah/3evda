import { notFound, permanentRedirect } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { get, json } from "./fresh";
import { href } from "./text";
import type { BlogArticleDetail, BlogPage, BlogTaxonomy, SitemapData } from "./types";

export function getArticles(
  lang: Locale,
  filters: { category?: string; tag?: string; page?: number } = {},
): Promise<BlogPage> {
  const params = new URLSearchParams({ lang });
  if (filters.category) params.set("category", filters.category);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return json<BlogPage>(`/api/public/blog/articles?${params}`);
}

export function getTaxonomy(lang: Locale): Promise<BlogTaxonomy> {
  return json<BlogTaxonomy>(`/api/public/blog/taxonomy?lang=${lang}`);
}

/** The article, a permanent redirect to its new address when it was renamed, or 404. */
export async function getArticle(lang: Locale, slug: string): Promise<BlogArticleDetail> {
  const res = await get(`/api/public/blog/articles/${lang}/${encodeURIComponent(slug)}/`);
  if (res.status === 301) {
    const moved = (await res.json()) as { slug: string };
    permanentRedirect(href(lang, `/blog/${encodeURIComponent(moved.slug)}`));
  }
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`article ${slug} → ${res.status}`);
  return (await res.json()) as BlogArticleDetail;
}

export function getPreview(token: string): Promise<BlogArticleDetail> {
  return json<BlogArticleDetail>(`/api/public/blog/preview/${encodeURIComponent(token)}`);
}

/** Raw list of public addresses for sitemap.xml (the API never includes drafts or scheduled articles). */
export function getSitemapData(): Promise<SitemapData> {
  return json<SitemapData>("/api/public/sitemap");
}
