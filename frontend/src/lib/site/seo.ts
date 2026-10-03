import type { Locale } from "@/i18n/config";
import { fallbackSrc } from "./media";
import { href, pick } from "./text";
import type { BlogArticle, BlogArticleDetail, Media, ProjectDetail, SiteData, SitemapData } from "./types";

/** Pages that exist once per language, in the order they appear in the menu. */
export const STATIC_PATHS = [
  "/",
  "/portfolio",
  "/services",
  "/packages",
  "/about",
  "/blog",
  "/contact",
] as const;

const LOCALES: Locale[] = ["fa", "en"];

export function siteOrigin(): string {
  return (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Absolute address of a page in a language (what crawlers and feed readers need). */
export function absoluteUrl(locale: Locale, path: string): string {
  const local = href(locale, path);
  return `${siteOrigin()}${local === "/" ? "" : local}` || siteOrigin();
}

/** Media URLs may be relative to the site; structured data and feeds need absolute ones. */
export function absoluteMedia(url: string): string {
  if (!url) return "";
  return /^https?:\/\//.test(url) ? url : `${siteOrigin()}${url.startsWith("/") ? "" : "/"}${url}`;
}

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  alternates?: { languages: Partial<Record<Locale, string>> };
};

const isLocale = (value: string): value is Locale => value === "fa" || value === "en";

/** Every public page with the languages it really exists in; drafts never arrive here (the API filters them). */
export function buildSitemap(data: SitemapData): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const both = (path: string, lastModified?: string) => {
    const languages = Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(l, path)])) as Record<
      Locale,
      string
    >;
    for (const locale of LOCALES) {
      entries.push({
        url: languages[locale],
        lastModified: lastModified ? new Date(lastModified) : undefined,
        alternates: { languages },
      });
    }
  };
  for (const path of STATIC_PATHS) both(path);
  for (const project of data.projects)
    both(`/portfolio/${encodeURIComponent(project.slug)}`, project.updated_at);
  for (const article of data.articles) {
    if (!isLocale(article.language)) continue;
    const languages: Partial<Record<Locale, string>> = {
      [article.language]: absoluteUrl(article.language, `/blog/${encodeURIComponent(article.slug)}`),
    };
    for (const alt of article.alternates) {
      if (isLocale(alt.language))
        languages[alt.language] = absoluteUrl(alt.language, `/blog/${encodeURIComponent(alt.slug)}`);
    }
    entries.push({
      url: languages[article.language] as string,
      lastModified: new Date(article.updated_at),
      alternates: Object.keys(languages).length > 1 ? { languages } : undefined,
    });
  }
  return entries;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 for one language: the newest articles, absolute links, summaries and covers. */
export function buildRss(site: SiteData, locale: Locale, articles: BlogArticle[]): string {
  const brand = pick(locale, site.settings.brand_name_fa, site.settings.brand_name_en);
  const description = pick(locale, site.settings.description_fa, site.settings.description_en) || brand;
  const feedPath = locale === "fa" ? "/rss.xml" : "/en/rss.xml";
  const items = articles
    .map((a) => {
      const link = absoluteUrl(locale, `/blog/${encodeURIComponent(a.slug)}`);
      const cover = a.cover ? absoluteMedia(fallbackSrc(a.cover)) : "";
      return [
        "    <item>",
        `      <title>${escapeXml(a.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        a.published_at ? `      <pubDate>${new Date(a.published_at).toUTCString()}</pubDate>` : "",
        `      <description>${escapeXml(a.summary)}</description>`,
        cover ? `      <enclosure url="${escapeXml(cover)}" type="image/webp" length="0"/>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(brand)}</title>
    <link>${escapeXml(absoluteUrl(locale, "/blog"))}</link>
    <description>${escapeXml(description)}</description>
    <language>${locale}</language>
    <atom:link href="${escapeXml(siteOrigin() + feedPath)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

type JsonLd = Record<string, unknown>;

/** Serialised for a <script type="application/ld+json">; "<" is escaped so the data can't close the tag. */
export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function photographerLd(site: SiteData, locale: Locale): JsonLd {
  const s = site.settings;
  const sameAs = s.instagram ? [`https://instagram.com/${s.instagram.replace(/^@/, "")}`] : [];
  return {
    "@context": "https://schema.org",
    "@type": ["Photographer", "LocalBusiness"],
    name: pick(locale, s.brand_name_fa, s.brand_name_en),
    description: pick(locale, s.description_fa, s.description_en) || undefined,
    url: absoluteUrl(locale, "/"),
    image: s.og_image ? absoluteMedia(fallbackSrc(s.og_image)) : undefined,
    telephone: s.phone || undefined,
    email: s.email || undefined,
    address: pick(locale, s.address_fa, s.address_en) || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };
}

export function breadcrumbLd(locale: Locale, trail: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(locale, item.path),
    })),
  };
}

function imageLd(media: Media | null | undefined, locale: Locale): JsonLd | undefined {
  if (!media) return undefined;
  const url = absoluteMedia(fallbackSrc(media));
  if (!url) return undefined;
  return {
    "@type": "ImageObject",
    url,
    width: media.width ?? undefined,
    height: media.height ?? undefined,
    caption: pick(locale, media.alt_fa, media.alt_en) || undefined,
  };
}

export function articleLd(site: SiteData, locale: Locale, article: BlogArticleDetail): JsonLd {
  const brand = pick(locale, site.settings.brand_name_fa, site.settings.brand_name_en);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.seo_description || article.summary || undefined,
    inLanguage: locale,
    datePublished: article.published_at ?? undefined,
    image: imageLd(article.og_image ?? article.cover, locale),
    mainEntityOfPage: absoluteUrl(locale, `/blog/${encodeURIComponent(article.slug)}`),
    author: { "@type": "Person", name: brand },
    publisher: { "@type": "Organization", name: brand },
  };
}

export function projectLd(locale: Locale, project: ProjectDetail, name: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name,
    url: absoluteUrl(locale, `/portfolio/${encodeURIComponent(project.slug)}`),
    image: imageLd(project.cover, locale),
  };
}
