import type { Locale } from "@/i18n/config";
import type { SiteData } from "./types";

type Bilingual = { fa: string; en: string };

/** The text for a locale; falls back to the other language when the owner left this one empty. */
export function pick(locale: Locale, fa: string | null | undefined, en: string | null | undefined): string {
  const primary = locale === "fa" ? fa : en;
  const secondary = locale === "fa" ? en : fa;
  return (primary || secondary || "").trim();
}

export function localized<T extends Record<string, unknown>>(locale: Locale, obj: T, field: string): string {
  return pick(locale, obj[`${field}_fa`] as string | undefined, obj[`${field}_en`] as string | undefined);
}

export function block(site: SiteData, locale: Locale, key: string): string {
  const b = site.blocks[key] as Bilingual | undefined;
  return b ? pick(locale, b.fa, b.en) : "";
}

export function blockMedia(site: SiteData, key: string) {
  return site.blocks[key]?.media ?? null;
}

/** Locale-aware path: Persian has no prefix, English lives under /en. */
export function href(locale: Locale, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === "fa") return clean;
  return clean === "/" ? "/en" : `/en${clean}`;
}

export function formatToman(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(amount);
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function instagramUrl(handle: string): string {
  if (!handle) return "";
  return /^https?:\/\//.test(handle) ? handle : `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}

export function telegramUrl(handle: string): string {
  if (!handle) return "";
  return /^https?:\/\//.test(handle) ? handle : `https://t.me/${handle.replace(/^@/, "")}`;
}

export function whatsappUrl(number: string): string {
  if (!number) return "";
  return /^https?:\/\//.test(number) ? number : `https://wa.me/${number.replace(/[^\d]/g, "")}`;
}
