import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { fallbackSrc } from "@/lib/site/media";
import { href, pick } from "@/lib/site/text";
import type { SiteData } from "@/lib/site/types";

export async function localeOf(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

/** Title/description/canonical/social card for a page; the brand name is appended to the title. */
export function pageMetadata(
  site: SiteData,
  locale: Locale,
  path: string,
  title: string,
  description?: string,
  image?: Parameters<typeof fallbackSrc>[0] | null,
): Metadata {
  const brand = pick(locale, site.settings.brand_name_fa, site.settings.brand_name_en);
  const desc = description || pick(locale, site.settings.description_fa, site.settings.description_en);
  const card = image ?? site.settings.og_image;
  return {
    title: title ? `${title} | ${brand}` : brand,
    description: desc || undefined,
    alternates: {
      canonical: href(locale, path),
      languages: { fa: href("fa", path), en: href("en", path) },
    },
    openGraph: {
      title: title || brand,
      description: desc || undefined,
      locale: locale === "fa" ? "fa_IR" : "en_US",
      images: card ? [{ url: fallbackSrc(card) }] : undefined,
    },
  };
}
