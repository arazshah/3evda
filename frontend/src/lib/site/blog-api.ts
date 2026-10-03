import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import type { Locale } from "@/i18n/config";
import { href } from "./text";
import type { BlogArticleDetail, BlogPage, BlogTaxonomy } from "./types";

const BASE = process.env.INTERNAL_API_URL ?? "http://localhost:8000";

/**
 * The journal is read without any cache on this side: a scheduled article must appear at its
 * publication time, and the API caches (and invalidates) its own responses for exactly that reason.
 */
async function get(path: string): Promise<Response> {
  await connection();
  try {
    return await fetch(`${BASE}${path}`, { cache: "no-store", redirect: "manual" });
  } catch (error) {
    throw new Error(`Public API unavailable: ${String(error)}`);
  }
}

async function json<T>(path: string): Promise<T> {
  const res = await get(path);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

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
